// ALLUVIAL / SANKEY
const widthAL = 700;
const heightAL = 500;

const svgAL = d3
  .select("#alluvial")
  .append("svg")
  .attr("width", widthAL)
  .attr("height", heightAL);

// Layout Sankey
const sankey = d3
  .sankey()
  .nodeId((d) => d.name)
  .nodeWidth(10)
  .nodePadding(10)
  .extent([
    [1, 1],
    [widthAL - 1, heightAL - 6],
  ]);

// Escala de cores para os nós
const colorAL = d3.scaleOrdinal(d3.schemeSet2);

// Variáveis globais
let alluvialFluxData = [];
let alluvialIso3cToArea = new Map();

Promise.all([
  d3.csv("data/bilat_mig_type.csv"),
  d3.csv("data/country_list.csv"),
]).then(([fluxos, countryList]) => {
  // Mapeia iso3c -> un_area
  countryList.forEach((c) => {
    alluvialIso3cToArea.set(c.iso3c, c.un_area);
  });

  // Converte e enriquece fluxos
  fluxos.forEach((d) => {
    d.year0 = +d.year0;
    d.da_pb_closed = +d.da_pb_closed;
    d.type = d.type.trim();
    d.orig_area = alluvialIso3cToArea.get(d.orig) || "Desconhecido";
    d.dest_area = alluvialIso3cToArea.get(d.dest) || "Desconhecido";
  });

  alluvialFluxData = fluxos;

  // Ajuste do range de fluxo
  const fluxMinVal = d3.min(fluxos, (d) => d.da_pb_closed) || 0;
  const fluxMaxVal = d3.max(fluxos, (d) => d.da_pb_closed) || 0;

  const inputFluxMin = document.getElementById("alluvial-flux-min");
  const inputFluxMax = document.getElementById("alluvial-flux-max");

  inputFluxMin.setAttribute("min", fluxMinVal);
  inputFluxMin.setAttribute("max", fluxMaxVal);
  inputFluxMin.value = 800000; // valor inicial de exemplo
  document.getElementById("alluvial-flux-min-value").textContent = fluxMinVal;

  inputFluxMax.setAttribute("min", fluxMinVal);
  inputFluxMax.setAttribute("max", fluxMaxVal);
  inputFluxMax.value = fluxMaxVal;
  document.getElementById("alluvial-flux-max-value").textContent = fluxMaxVal;

  // Extrair valores distintos de "type" e "un_area"
  const typeSet = new Set(fluxos.map((d) => d.type));
  const areaSet = new Set([
    ...fluxos.map((d) => d.orig_area),
    ...fluxos.map((d) => d.dest_area),
  ]);

  // Criar checkboxes dinamicamente
  createCheckboxes(
    "alluvial-type-container",
    "alluvial-type",
    Array.from(typeSet)
  );
  createCheckboxes(
    "alluvial-orig-container",
    "alluvial-orig",
    Array.from(areaSet)
  );
  createCheckboxes(
    "alluvial-dest-container",
    "alluvial-dest",
    Array.from(areaSet)
  );

  // Desenha Sankey inicialmente
  updateAlluvial();
});

function createCheckboxes(containerId, prefix, values) {
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

function getCheckedValues(prefix) {
  const inputs = document.querySelectorAll(`input[id^="${prefix}-"]`);
  const vals = [];
  inputs.forEach((inp) => {
    if (inp.checked) vals.push(inp.value);
  });
  return vals;
}

function updateAlluvial() {
  // 1) Ler valores dos sliders
  const yearMin = +document.getElementById("alluvial-year-min").value;
  const yearMax = +document.getElementById("alluvial-year-max").value;
  const fluxMin = +document.getElementById("alluvial-flux-min").value;
  const fluxMax = +document.getElementById("alluvial-flux-max").value;

  // 2) Ler checkboxes
  const selectedTypes = getCheckedValues("alluvial-type");
  const selectedOrig = getCheckedValues("alluvial-orig");
  const selectedDest = getCheckedValues("alluvial-dest");

  // 3) Filtrar
  const dataFiltered = alluvialFluxData.filter((d) => {
    return (
      d.year0 >= yearMin &&
      d.year0 <= yearMax &&
      d.da_pb_closed >= fluxMin &&
      d.da_pb_closed <= fluxMax &&
      selectedTypes.includes(d.type) &&
      selectedOrig.includes(d.orig_area) &&
      selectedDest.includes(d.dest_area)
    );
  });

  // 4) Agrupar por iso3c
  const grouped = d3.rollup(
    dataFiltered,
    (arr) => d3.sum(arr, (dd) => dd.da_pb_closed),
    (d) => d.orig,
    (d) => d.dest
  );

  // 5) Monta nodes e links
  const nodesMap = new Map();
  const links = [];

  for (const [origIso, mapDest] of grouped.entries()) {
    for (const [destIso, totalFlow] of mapDest.entries()) {
      if (origIso === destIso) continue;
      const sourceName = `${origIso}-orig`;
      const targetName = `${destIso}-dest`;

      if (!nodesMap.has(sourceName)) {
        nodesMap.set(sourceName, { name: sourceName, iso: origIso });
      }
      if (!nodesMap.has(targetName)) {
        nodesMap.set(targetName, { name: targetName, iso: destIso });
      }
      links.push({
        source: sourceName,
        target: targetName,
        value: totalFlow,
      });
    }
  }

  const nodes = Array.from(nodesMap.values());
  const sankeyData = { nodes, links };

  // Limpa o SVG
  svgAL.selectAll("*").remove();

  // Verifica se há dados
  if (!nodes.length || !links.length) {
    svgAL
      .append("text")
      .attr("x", 10)
      .attr("y", 20)
      .text("Nenhum dado filtrado.");
    return;
  }

  // Executa o layout Sankey
  sankey(sankeyData);

  // Criar defs para gradientes
  const defs = svgAL.append("defs");

  // Para cada link, cria um gradiente que vai da cor do nó de origem à cor do nó de destino
  defs
    .selectAll("linearGradient")
    .data(sankeyData.links)
    .enter()
    .append("linearGradient")
    .attr("id", (d, i) => `gradient-link-${i}`)
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("x1", (d) => d.source.x1)
    .attr("x2", (d) => d.target.x0)
    .attr("y1", (d) => d.source.y0 + (d.source.y1 - d.source.y0) / 2)
    .attr("y2", (d) => d.target.y0 + (d.target.y1 - d.target.y0) / 2)
    .selectAll("stop")
    .data((d) => [
      { offset: "0%", color: colorAL(d.source.iso) },
      { offset: "100%", color: colorAL(d.target.iso) },
    ])
    .enter()
    .append("stop")
    .attr("offset", (stop) => stop.offset)
    .attr("stop-color", (stop) => stop.color);

  // Desenhar links usando o gradiente
  svgAL
    .append("g")
    .selectAll("path")
    .data(sankeyData.links)
    .join("path")
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke", (d, i) => `url(#gradient-link-${i})`)
    .attr("stroke-width", (d) => Math.max(1, d.width))
    .attr("fill", "none")
    .attr("opacity", 0.8);

  // Desenhar nós
  const node = svgAL
    .append("g")
    .selectAll("g")
    .data(sankeyData.nodes)
    .join("g");

  node
    .append("rect")
    .attr("x", (d) => d.x0)
    .attr("y", (d) => d.y0)
    .attr("width", (d) => d.x1 - d.x0)
    .attr("height", (d) => d.y1 - d.y0)
    .attr("fill", (d) => colorAL(d.iso))
    .attr("stroke", "#999");

  node
    .append("text")
    .attr("x", (d) => (d.x0 < widthAL / 2 ? d.x1 + 6 : d.x0 - 6))
    .attr("y", (d) => (d.y1 + d.y0) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", (d) => (d.x0 < widthAL / 2 ? "start" : "end"))
    // Pode mostrar apenas iso, se quiser algo mais curto:
    // .text((d) => d.iso)
    // Ou o nome completo do nó:
    .text((d) => d.name);
}
