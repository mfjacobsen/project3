import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

document.addEventListener('DOMContentLoaded', () => {
  const margin = { top: 20, right: 30, bottom: 40, left: 50 },
        fullW = 800, fullH = 300,
        width = fullW - margin.left - margin.right,
        height= fullH - margin.top  - margin.bottom;

  function parseEff(d) {
    return {
      quantile: +d.quantile,
      time:     +d.time,
      avg:      +d.smoothed_O2_eff || +d.avg_O2_efficiency,
      prop:     Math.min(1, +d.prop_surv)
    };
  }

  function parseRate(d) {
    return {
      quantile: +d.quantile,
      time:     +d.time,
      avg:      +d.smoothed_O2_rate || +d.avg_O2_rate,
      prop:     Math.min(1, +d.prop_surv)
    };
  }

  Promise.all([
    d3.csv('data/O2_effi.csv', parseEff),
    d3.csv('data/O2_rate.csv', parseRate)
  ]).then(([effData, rateData]) => {
    const maxTime = d3.max([d3.max(effData, d=>d.time), d3.max(rateData, d=>d.time)]);
    const color = d3.scaleOrdinal().domain([0,1,2,3,4]).range(d3.schemeSet2);

    // Updated stages
    const stages = [
      { name:'Warm-Up (0–200s)',    x0:0,    x1:200,  text:'In the first 200s, elite runners (Q4) show superior O₂ exchange efficiency while absolute uptake ramps up.' },
      { name:'Threshold (200–700s)',x0:200,  x1:700,  text:'From 200–700s, elite runners lead in both efficiency and O₂ volume, marking peak performance.' },
      { name:'Fatigue (700–1200s)', x0:700,  x1:maxTime, text:'After 700s, elite runners’ metrics decline fastest, indicating onset of fatigue.' }
    ];

    let stageIdx=0, playing=false, timer;

    function buildChart(containerID, data, yLabel, annotateRight=false) {
      const flat = data.slice();
      const svg = d3.select(containerID).append('svg')
        .attr('viewBox',`0 0 ${fullW} ${fullH}`)
        .attr('preserveAspectRatio','xMidYMid meet')
        .style('width','100%').style('height','auto')
        .append('g').attr('transform',`translate(${margin.left},${margin.top})`);

      const x = d3.scaleLinear().domain([0,maxTime]).range([0,width]);
      const y = d3.scaleLinear().domain([0,d3.max(data,d=>d.avg)]).nice().range([height,0]);

      // Axes
      svg.append('g').call(d3.axisLeft(y));
      svg.append('g')
        .attr('transform',`translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(10))
        .append('text')
          .attr('x',width/2).attr('y',35).attr('text-anchor','middle')
          .text('Time (s)');
      svg.append('text')
        .attr('transform','rotate(-90)')
        .attr('x',-height/2).attr('y',-40)
        .attr('text-anchor','middle')
        .text(yLabel);

      const grouped = d3.group(data, d=>d.quantile);
      const lineGen = d3.line().x(d=>x(d.time)).y(d=>y(d.avg));

      // Draw lines & dots
      grouped.forEach((pts,q) => {
        const valid = pts.filter(d=>d.prop>=0.1);
        if(!valid.length) return;
        svg.append('path')
          .datum(valid)
          .attr('class',`line q${q}`)
          .attr('fill','none')
          .attr('stroke',color(q))
          .attr('stroke-width',1.5)
          .attr('d',lineGen);
        svg.append('g').attr('class',`dots q${q}`)
          .selectAll('circle').data(valid).join('circle')
            .attr('cx',d=>x(d.time)).attr('cy',d=>y(d.avg))
            .attr('r',4).attr('fill',color(q)).attr('opacity',d=>d.prop)
            .on('mouseover',(_,d)=>{
              const t=d.time;
              svg.selectAll('circle').attr('opacity',0.1).attr('r',4);
              svg.selectAll('circle').filter(dp=>dp.time===t).attr('opacity',1).attr('r',6);
              const [px,py]=d3.pointer(_,window);
              const items=flat.filter(dp=>dp.time===t && dp.prop>=0.1);
              const html=items.map(dp=>`<strong>Q${dp.quantile}</strong> ${yLabel}: ${dp.avg.toFixed(1)}<br>`).join('');
              d3.select('body').selectAll('.tooltip').remove();
              d3.select('body').append('div').attr('class','tooltip')
                .style('left',`${px+15}px`).style('top',`${py}px`)
                .style('background','rgba(0,0,0,0.7)').style('color','#fff')
                .style('padding','6px').style('border-radius','4px').html(html);
            })
            .on('mouseout',()=>{
              svg.selectAll('circle').attr('opacity',d=>d.prop).attr('r',4);
              d3.select('body').selectAll('.tooltip').remove();
            });
      });

      // Legend
      const legend=svg.append('g').attr('transform',`translate(${width-80},10)`);
      [...grouped.keys()].forEach((q,i)=>{
        legend.append('rect').attr('x',0).attr('y',i*20).attr('width',12).attr('height',12).attr('fill',color(q));
        legend.append('text').attr('x',18).attr('y',i*20+10).attr('font-size','12px').text(`Quantile ${q}`);
      });

      // Shading overlays
      const overlayBefore = svg.append('rect').attr('class','overlay before').attr('y',0).attr('height',height).attr('fill','lightgrey').attr('opacity',0.5);
      const overlayAfter  = svg.append('rect').attr('class','overlay after' ).attr('y',0).attr('height',height).attr('fill','lightgrey').attr('opacity',0.5);

      // Annotation updater
      function showStage(s, idx) {
        overlayBefore.attr('x',0).attr('width',x(s.x0));
        overlayAfter .attr('x',x(s.x1)).attr('width',width-x(s.x1));
        svg.selectAll('circle').attr('opacity',d=>(d.time>=s.x0&&d.time<=s.x1)?1:0.1).attr('r',d=>(d.time>=s.x0&&d.time<=s.x1)?6:4);
        svg.selectAll('.line').attr('stroke-opacity',0.2).attr('stroke-width',1);
        grouped.forEach((pts,q)=>{
          const anyIn = pts.some(d=>d.time>=s.x0&&d.time<=s.x1&&d.prop>=0.1);
          if(anyIn) svg.select(`.line.q${q}`).attr('stroke-opacity',1).attr('stroke-width',2);
        });
        if(annotateRight) {
          document.getElementById('annotationText').textContent = `${s.name}: ${s.text} Please hover over the dots to see the values.`;
        }
      }

      return showStage;
    }

    const updateEff = buildChart('#efficiencyChart', effData, 'O₂ Exchange Efficiency (%)', false);
    const updateRate= buildChart('#rateChart',      rateData, 'O₂ Uptake Rate (mL/min)',      true);

    const playBtn = d3.select('#playBtn'), pauseBtn = d3.select('#pauseBtn');
    function start() {
      if(playing) return; playing=true; stageIdx=0;
      playBtn.attr('disabled',true); pauseBtn.attr('disabled',null);
      function step() {
        if(!playing) return;
        const s = stages[stageIdx];
        updateEff(s, stageIdx); updateRate(s, stageIdx);
        const pct = Math.round(((stageIdx+1)/stages.length)*100);
        d3.select('#progressBar').style('width', pct + '%');
        stageIdx++;
        if(stageIdx < stages.length) timer = setTimeout(step, 3000);
        else { playing=false; playBtn.attr('disabled',null); pauseBtn.attr('disabled',true); }
      }
      step();
    }
    function stop() { playing=false; clearTimeout(timer); playBtn.attr('disabled',null); pauseBtn.attr('disabled',true); }
    playBtn.on('click', start); pauseBtn.on('click', stop);
  });
});
