// STACKED AREA
const marginSA = { top: 40, right: 220, bottom: 50, left: 70 },
  totalWidthSA = 800,
  totalHeightSA = 400,
  widthSA = totalWidthSA - marginSA.left - marginSA.right,
  heightSA = totalHeightSA - marginSA.top - marginSA.bottom;

// SVG principal
const svgSA = d3
  .select("#stacked-area")
  .append("svg")
  .attr("width", totalWidthSA)
  .attr("height", totalHeightSA)
  .append("g")
  .attr("transform", `translate(${marginSA.left},${marginSA.top})`);

// Substituímos scaleBand() por scaleLinear() para o eixo X
const xScaleSA = d3.scaleLinear().range([0, widthSA]);
const yScaleSA = d3.scaleLinear().range([heightSA, 0]);

// Paleta de cores
const colorScaleSA = d3.scaleOrdinal(d3.schemeSet2);

let stackedFluxData = [];
let stackedIso3cToArea = new Map();

Promise.all([
  d3.csv("data/bilat_mig_type.csv"),
  d3.csv("data/country_list.csv"),
]).then(([fluxos, cList]) => {
  // Mapeia iso3c -> un_area
  cList.forEach((c) => {
    stackedIso3cToArea.set(c.iso3c, c.un_area);
  });

  // Processa dados
  fluxos.forEach((d) => {
    d.year0 = +d.year0; // garante que seja número
    d.da_pb_closed = +d.da_pb_closed;
    d.type = d.type.trim();
    d.orig_area = stackedIso3cToArea.get(d.orig) || "Desconhecido";
  });

  stackedFluxData = fluxos;

  // Descobrir valores únicos de 'type' e 'orig_area'
  const typeSet = new Set(fluxos.map((d) => d.type));
  const areaSet = new Set(fluxos.map((d) => d.orig_area));

  // Cria checkboxes
  createCheckboxesStacked(
    "stacked-type-container",
    "stacked-type",
    Array.from(typeSet)
  );
  createCheckboxesStacked(
    "stacked-orig-container",
    "stacked-orig",
    Array.from(areaSet)
  );

  updateStackedArea();
});

/**
 * Criação das checkboxes de forma dinâmica
 */
function createCheckboxesStacked(containerId, prefix, values) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  values.sort();
  values.forEach((val) => {
    const div = document.createElement("div");
    div.className = "form-check";

    const inp = document.createElement("input");
    inp.type = "checkbox";
    inp.className = "form-check-input";
    inp.id = prefix + "-" + val;
    inp.value = val;
    inp.checked = true;

    const label = document.createElement("label");
    label.className = "form-check-label";
    label.htmlFor = inp.id;
    label.textContent = val;

    div.appendChild(inp);
    div.appendChild(label);
    container.appendChild(div);
  });
}

function getCheckedValuesStacked(prefix) {
  const inputs = document.querySelectorAll(`input[id^="${prefix}-"]`);
  const vals = [];
  inputs.forEach((inp) => {
    if (inp.checked) vals.push(inp.value);
  });
  return vals;
}

/**
 * Função principal: desenha / redesenha o Stacked Area
 */
function updateStackedArea() {
  const yearMin = +document.getElementById("stacked-year-min").value;
  const yearMax = +document.getElementById("stacked-year-max").value;

  const selectedTypes = getCheckedValuesStacked("stacked-type");
  const selectedAreas = getCheckedValuesStacked("stacked-orig");

  // Filtra
  const dataFiltered = stackedFluxData.filter((d) => {
    return (
      d.year0 >= yearMin &&
      d.year0 <= yearMax &&
      selectedTypes.includes(d.type) &&
      selectedAreas.includes(d.orig_area)
    );
  });

  // Agrupa (year0, orig_area)
  const dadosPorAnoERegiao = d3.rollup(
    dataFiltered,
    (v) => d3.sum(v, (dd) => dd.da_pb_closed),
    (d) => d.year0,
    (d) => d.orig_area
  );

  const anos = Array.from(dadosPorAnoERegiao.keys()).sort((a, b) => a - b);

  if (anos.length === 0) {
    svgSA.selectAll("*").remove();
    svgSA
      .append("text")
      .attr("x", 10)
      .attr("y", 20)
      .text("Nenhum dado filtrado.");
    return;
  }

  // Cria lista de "regioes" a partir do que foi agrupado
  const regiaoSet = new Set();
  dadosPorAnoERegiao.forEach((mapR) => {
    mapR.forEach((_, r) => regiaoSet.add(r));
  });
  const regioes = Array.from(regiaoSet);

  // Array para stack
  const stackedData = anos.map((ano) => {
    const obj = { year: ano };
    const mapaRegioes = dadosPorAnoERegiao.get(ano);
    regioes.forEach((r) => {
      obj[r] = mapaRegioes?.get(r) || 0;
    });
    return obj;
  });

  // Definimos minYear e maxYear REAIS (dos dados filtrados)
  const minYearData = d3.min(anos);
  const maxYearData = d3.max(anos);

  // Ajusta o domínio do xScaleSA como contínuo
  xScaleSA.domain([minYearData, maxYearData]);

  // Define stack
  const stack = d3.stack().keys(regioes);
  const series = stack(stackedData);

  const yMax = d3.max(series, (s) => d3.max(s, (d) => d[1])) || 0;
  yScaleSA.domain([0, yMax]);

  colorScaleSA.domain(regioes);

  // Limpa o SVG
  svgSA.selectAll("*").remove();

  // Desenha as áreas
  svgSA
    .selectAll(".layer")
    .data(series)
    .enter()
    .append("path")
    .attr("class", "layer")
    .style("fill", (d) => colorScaleSA(d.key))
    .attr(
      "d",
      d3
        .area()
        // X = xScaleSA(d.data.year)
        .x((d) => xScaleSA(d.data.year))
        .y0((d) => yScaleSA(d[0]))
        .y1((d) => yScaleSA(d[1]))
    );

  // === Eixo X: anos de 2 em 2, no range [minYearData, maxYearData] ===
  const tickValuesX = d3
    .range(minYearData, maxYearData + 1, 2) // step = 2
    .filter((val) => val >= minYearData && val <= maxYearData);

  // Desenha o eixo X
  svgSA
    .append("g")
    .attr("transform", `translate(0,${heightSA})`)
    .call(
      d3.axisBottom(xScaleSA).tickValues(tickValuesX).tickFormat(d3.format("d")) // remover decimais
    );

  // Eixo Y
  svgSA
    .append("g")
    .call(d3.axisLeft(yScaleSA).ticks(5).tickFormat(d3.format(".2s")));

  // Label do eixo Y
  svgSA
    .append("text")
    .attr("transform", "rotate(-90)")
    .attr("y", -marginSA.left + 15)
    .attr("x", -heightSA / 2)
    .attr("dy", "1em")
    .style("text-anchor", "middle")
    .text("Fluxo Migratório");

  // Legenda
  const legend = svgSA
    .selectAll(".legend")
    .data(regioes)
    .enter()
    .append("g")
    .attr("class", "legend")
    .attr("transform", (d, i) => `translate(${widthSA + 10},${i * 20})`);

  legend
    .append("rect")
    .attr("width", 15)
    .attr("height", 15)
    .style("fill", (d) => colorScaleSA(d));

  legend
    .append("text")
    .attr("x", 20)
    .attr("y", 12)
    .text((d) => d);
}
