import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const main_data_path = "data/main_plot.csv";
const hr_data_path = "data/hr_data.csv";

const main_window_width = 1000
const main_window_height = 400

const main_chart_flex = 2
const side_chart_flex = 1

const flex_tot = main_chart_flex + side_chart_flex
const main_plot_width = Math.round(main_window_width * (main_chart_flex / flex_tot))
const side_plot_width = main_window_width - main_plot_width

const chartDiv = document.getElementById("chart");
const sideChartDiv = document.getElementById("side-chart");
const mainWindowDiv = document.getElementById("main-window");

chartDiv.style.flex = main_chart_flex;
sideChartDiv.style.flex = side_chart_flex;
mainWindowDiv.style.maxWidth = `${main_window_width}px`;

let xScale, yScale;
let xScaleSide, yScaleSide
const yDomainHr = [50,200]

function formatTimeMMSS(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Loads and formats main plot data
async function loadMainData(path) {

    const data = await d3.csv(path, (row) => ({
        ...row,
        time: Number(row.time), 
        speed: Number(row.speed),
        remaining: Number(row.remaining),
        pace:row.pace
    }));

    return data;
}

// Loads and formats heart rate side plot data
async function loadHrData(path) {
    const data = await d3.csv(path, (row) => ({
        ...row,
        time: Number(row.time),
        quintile: Number(row.max_speed_quintile),
        hr: Number(row.HR),
    }));

    console.log(data)
    return data;
}

// Renders the main plot
function renderMainPlot(data) {

    // Define plot dimenstions
    const width = main_plot_width;
    const height = main_window_height;

    // Define margins and usable area
    const margin = { 
        top: 30, 
        right: 20, 
        bottom: 80, 
        left: 80
     };
    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
      };

    // Create the SVG element
    const container = d3.select('#chart'); // or '#side-chart'
    const svg = container
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('width', '100%')
        .style('height', '100%');

    // Create axis scales
    xScale = d3
        .scaleLinear()
        .domain(d3.extent(data, d => d.time))
        .range([usableArea.left, usableArea.right]);
    yScale = d3
        .scaleLinear()
        .domain([0,1000])
        .range([usableArea.bottom, usableArea.top]);

    // Create axes and gridlines
    const xAxis = d3
        .axisBottom(xScale)
        .tickFormat(formatTimeMMSS);
    const yAxis = d3.axisLeft(yScale);

    // Draw gridlines
    const gridlines = svg
        .append('g')
        .attr('class', 'gridlines')
        .attr('transform', `translate(${usableArea.left}, 0)`)
        .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));
    
    // Draw axes
    svg
        .append('g')
        .attr('transform', `translate(0, ${usableArea.bottom})`)
        .call(xAxis);
    svg
        .append('g')
        .attr('transform', `translate(${usableArea.left}, 0)`)
        .call(yAxis);

    // Create and draw plot line 
    const line = d3.line()
        .x(d => xScale(d.time))
        .y(d => yScale(d.remaining));
    svg.append('path')
        .datum(data) 
        .attr('fill', 'none')
        .attr('stroke', 'steelblue')
        .attr('stroke-width', 3)
        .attr('d', line)

    // X-axis label
    svg.append('text')
        .attr('class', 'x axis-label')
        .attr('text-anchor', 'middle')
        .attr('x', usableArea.left + usableArea.width / 2)
        .attr('y', height - margin.bottom / 2 + 5)
        .text('Time Elapsed (min:sec)');

    // Y-axis label
    svg.append('text')
        .attr('class', 'y axis-label')
        .attr('text-anchor', 'middle')
        .attr('transform', 'rotate(-90)')
        .attr('x', -(usableArea.top + usableArea.height / 2))
        .attr('y', margin.left / 2 - 5)
        .text('Runners Remaining');

    // Create focus line
    const focusLine = svg.append('line')
        .attr('stroke', '#999')
        .attr('stroke-width', 1)
        .attr('y1', usableArea.top)
        .attr('y2', usableArea.bottom)
        .attr('visibility', 'hidden');

    // Create focus dot
    const focusDot = svg.append('circle')
        .attr('r', 4)
        .attr('fill', 'steelblue')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .attr('visibility', 'hidden');

    // Create tooltip
    const chart = document.getElementById('chart');
    const tooltip = document.createElement('dl');
    tooltip.id = 'main-tooltip';
    tooltip.className = 'info tooltip';
    tooltip.hidden = true;

    // Define tooltip labels and id's
    const tooltipFields = {
        "Runners Remaining:": "people-remaining",
        "Time Elapsed:": "time-elapsed",
        "Treadmill Speed:": "treadmill-speed",
        "Treadmill Pace:": "treadmill-pace"
    };

    // Add tooltip to html
    let html = '';
    for (const [label, id] of Object.entries(tooltipFields)) {
        html += `<dt>${label}</dt><dd id="${id}"></dd>`;
    }
    tooltip.innerHTML = html;
    chart.appendChild(tooltip);

    // Create hidden rectangle to capture mouse movement
    const overlay = svg.append('rect')
        .attr('x', usableArea.left)
        .attr('y', usableArea.top)
        .attr('width', usableArea.width)
        .attr('height', usableArea.height)
        .style('fill', 'none')
        .style('pointer-events', 'all')
        .on('mousemove', (event) => {
            const [mx] = d3.pointer(event);
            const x0 = xScale.invert(mx);
            const bisect = d3.bisector(d => d.time).left;
            const i = bisect(data, x0);
            const d0 = data[i - 1];
            const d1 = data[i];
            const d = x0 - d0?.time < d1?.time - x0 ? d0 : d1;

            if (!d) return;

            focusLine
                .attr('x1', xScale(d.time))
                .attr('x2', xScale(d.time))
                .attr('visibility', 'visible');

            focusDot
                .attr('cx', xScale(d.time))
                .attr('cy', yScale(d.remaining))
                .attr('visibility', 'visible');

            renderTooltipContent(d);
            updateTooltipVisibility(true);
            updateTooltipPosition(d, width, height);
            updateSidePlot(d.time)})
        .on('mouseleave', () => {
            focusLine.attr('visibility', 'hidden');
            focusDot.attr('visibility', 'hidden');
            updateTooltipVisibility(false);});
}

function renderHrPlot(data) {

    // Define plot dimenstions
    const width = side_plot_width;
    const height = main_window_height;

    // Define margins and usable area
    const margin = {
        top: 30,
        right: 20,
        bottom: 80,
        left: 80
    };
    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    // Create the SVG element
    const container = d3.select('#side-chart'); // or '#side-chart'

    // Create the SVG element
    const svg = container
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('width', '100%')
        .style('height', '100%')

    // Define shared axis scales
    xScaleSide = d3
        .scaleBand()
        .domain([1,2,3,4,5])  // all quintiles
        .range([usableArea.left, usableArea.right])
        .padding(0.2);

    yScaleSide = d3
        .scaleLinear()
        .domain(yDomainHr)  // fixed HR range
        .range([usableArea.bottom, usableArea.top]);

    // Create axes and gridlines
    const xAxis = d3
        .axisBottom(xScaleSide)
    const yAxis = d3.axisLeft(yScaleSide);

    // Draw gridlines
    const gridlines = svg
        .append('g')
        .attr('class', 'gridlines')
        .attr('transform', `translate(${usableArea.left}, 0)`)
        .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

    // Draw axes
    svg
        .append('g')
        .attr('transform', `translate(0, ${usableArea.bottom})`)
        .call(xAxis);
    svg
        .append('g')
        .attr('transform', `translate(${usableArea.left}, 0)`)
        .call(yAxis);

    // X-axis label
    svg.append('text')
        .attr('class', 'x axis-label')
        .attr('text-anchor', 'middle')
        .attr('x', usableArea.left + usableArea.width / 2)
        .attr('y', height - margin.bottom / 2 + 5)
        .text('Performance Quintile');

    // Y-axis label
    svg.append('text')
        .attr('class', 'y axis-label')
        .attr('text-anchor', 'middle')
        .attr('transform', 'rotate(-90)')
        .attr('x', -(usableArea.top + usableArea.height / 2))
        .attr('y', margin.left / 2 - 5)
        .text('Mean Heart Rate');

    svg.append("g").attr("class", "bars");
    
}

function updateSidePlot(time) {

    const container = d3.select('#side-chart');
    const svg = container.select("svg");
    const barGroup = svg.select(".bars");

    const data = hr_data
        .filter(d => d.time === time)
        .map(d => ({ quintile: +d.quintile, hr: +d.hr }));

    const bars = barGroup.selectAll("rect").data(data, d => d.quintile);

    const colorScale = d3.scaleSequential()
        .domain([1, 5])
        .interpolator(d3.interpolateViridis);

    // ENTER + UPDATE
    bars.enter()
        .append("rect")
        .attr("x", d => xScaleSide(d.quintile))
        .attr("width", xScaleSide.bandwidth())
        .attr("y", yScaleSide(yDomainHr[0]))
        .attr("height", 0)
        .attr("fill", d => colorScale(d.quintile))
        .merge(bars)
        .transition()
        .duration(50)
        .attr("x", d => xScaleSide(d.quintile))
        .attr("width", xScaleSide.bandwidth())
        .attr("y", d => yScaleSide(d.hr))
        .attr("height", d => yScaleSide(yDomainHr[0]) - yScaleSide(d.hr));

    // EXIT
    bars.exit().remove();
}

// Updates main plot tooltip position
function updateTooltipPosition(d, width, height) {
    const tooltip = document.getElementById('main-tooltip');
    const chartRect = document.querySelector('#chart svg').getBoundingClientRect();

    const scaleX = chartRect.width / width;
    const scaleY = chartRect.height / height;

    const x = xScale(d.time) * scaleX + chartRect.left;
    const y = yScale(d.remaining) * scaleY + chartRect.top;

    const chartMidX = chartRect.left + chartRect.width / 2;
    const extra = 200 * scaleX

    const verticalOffset = x < chartMidX + extra ? -10 : -tooltip.offsetHeight - 20;
    const horizontalOffset = ((x < chartMidX + extra && x - tooltip.offsetWidth >chartRect.left) || chartRect.right - x < tooltip.offsetWidth ) 
        ? -tooltip.offsetWidth -10
        : 10;

    tooltip.style.left = `${x + horizontalOffset}px`;
    tooltip.style.top = `${y + verticalOffset}px`;
}

// Renders main plot tool tip
function renderTooltipContent(row) {
    const remaining = document.getElementById('people-remaining');
    const time = document.getElementById('time-elapsed');
    const speed = document.getElementById('treadmill-speed');
    const pace = document.getElementById('treadmill-pace');

    if (Object.keys(row).length === 0) return;

    remaining.textContent = row.remaining
    time.textContent = formatTimeMMSS(row.time)
    speed.textContent = `${row.speed} kph`
    pace.textContent = `${row.pace} / mile`
}

// Updates tooltip visibility
function updateTooltipVisibility(isVisible) {
    const tooltip = document.getElementById('main-tooltip');
    tooltip.hidden = !isVisible;
}

let main_data = await loadMainData(main_data_path);
renderMainPlot(main_data);

let hr_data = await loadHrData(hr_data_path);
renderHrPlot(hr_data);
updateSidePlot(100);