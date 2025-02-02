// TREEMAP
const widthTM = 800;
const heightTM = 500;

const svgTM = d3
  .select("#treemap")
  .append("svg")
  .attr("width", widthTM)
  .attr("height", heightTM);

// Layout e cor
const treemapLayout = d3.treemap().size([widthTM, heightTM]).padding(2);

// Paleta de cores para nível "pai" (origem)
const colorParentTM = d3.scaleOrdinal(d3.schemePastel2);

// Para gerar variação automática para os filhos, podemos usar uma escala adicional ou manipular HSL
function getChildColor(parentColor, index) {
  const c = d3.color(parentColor).rgb();
  // Ajuste leve no canal B (exemplo); poderia ser HSL
  c.b = Math.max(0, c.b - index * 10);
  return c.formatRgb();
}

const tooltipTM = d3
  .select("#global-tooltip")
  .style("position", "absolute")
  .style("visibility", "hidden");

let treemapFluxData = [];
let treemapIso3cToArea = new Map();

Promise.all([
  d3.csv("data/bilat_mig_type.csv"),
  d3.csv("data/country_list.csv"),
]).then(([fluxos, cList]) => {
  cList.forEach((c) => {
    treemapIso3cToArea.set(c.iso3c, c.un_area);
  });

  fluxos.forEach((d) => {
    d.year0 = +d.year0;
    d.da_pb_closed = +d.da_pb_closed;
    d.orig_area = treemapIso3cToArea.get(d.orig) || "Desconhecido";
    d.dest_area = treemapIso3cToArea.get(d.dest) || "Desconhecido";
  });

  treemapFluxData = fluxos;

  // Extrair valores únicos de un_area
  const areaSet = new Set([
    ...fluxos.map((d) => d.orig_area),
    ...fluxos.map((d) => d.dest_area),
  ]);

  createCheckboxesTreemap(
    "treemap-orig-container",
    "treemap-orig",
    Array.from(areaSet)
  );
  createCheckboxesTreemap(
    "treemap-dest-container",
    "treemap-dest",
    Array.from(areaSet)
  );

  updateTreemap();
});

/**
 * Função para criar checkboxes dinamicamente
 */
function createCheckboxesTreemap(containerId, prefix, values) {
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

function getCheckedValuesTreemap(prefix) {
  const inputs = document.querySelectorAll(`input[id^="${prefix}-"]`);
  const vals = [];
  inputs.forEach((inp) => {
    if (inp.checked) vals.push(inp.value);
  });
  return vals;
}

/**
 * Função auxiliar que trunca texto de um <tspan> se exceder 'maxWidth'
 */
function truncateTspan(tspan, maxWidth) {
  let textStr = tspan.text();
  while (
    textStr.length > 0 &&
    tspan.node().getComputedTextLength() > maxWidth
  ) {
    textStr = textStr.slice(0, -1); // remove último caractere
    tspan.text(textStr + "…"); // adiciona reticências
  }
}

function updateTreemap() {
  const yearMin = +document.getElementById("treemap-year-min").value;
  const yearMax = +document.getElementById("treemap-year-max").value;

  const selOrig = getCheckedValuesTreemap("treemap-orig");
  const selDest = getCheckedValuesTreemap("treemap-dest");

  const dataFiltered = treemapFluxData.filter((d) => {
    return (
      d.year0 >= yearMin &&
      d.year0 <= yearMax &&
      selOrig.includes(d.orig_area) &&
      selDest.includes(d.dest_area)
    );
  });

  // Agrupar
  const groupSums = d3.rollup(
    dataFiltered,
    (v) => d3.sum(v, (dd) => dd.da_pb_closed),
    (d) => d.orig_area,
    (d) => d.dest_area
  );

  // Hierarquia
  const hierarchyData = { name: "root", children: [] };
  for (const [oArea, mapDest] of groupSums.entries()) {
    const childrenDest = [];
    let idx = 0;
    for (const [dArea, val] of mapDest.entries()) {
      childrenDest.push({
        name: `${oArea} -> ${dArea}`,
        value: val,
        childIndex: idx, // para variação de cor
      });
      idx++;
    }
    hierarchyData.children.push({
      name: oArea,
      children: childrenDest,
    });
  }

  // Limpa o SVG
  svgTM.selectAll("*").remove();

  const root = d3.hierarchy(hierarchyData).sum((d) => d.value);
  if (!root.children || root.children.length === 0) {
    svgTM
      .append("text")
      .attr("x", 10)
      .attr("y", 20)
      .text("Nenhum dado filtrado.");
    return;
  }

  treemapLayout(root);

  const leaves = root.leaves();
  if (!leaves || leaves.length === 0) {
    svgTM
      .append("text")
      .attr("x", 10)
      .attr("y", 20)
      .text("Sem folhas no Treemap.");
    return;
  }

  // Desenha retângulos
  svgTM
    .selectAll("rect")
    .data(leaves)
    .join("rect")
    .attr("x", (d) => d.x0)
    .attr("y", (d) => d.y0)
    .attr("width", (d) => d.x1 - d.x0)
    .attr("height", (d) => d.y1 - d.y0)
    // Cor base do pai
    .attr("fill", (d) => {
      const parentColor = colorParentTM(d.parent.data.name);
      return getChildColor(parentColor, d.data.childIndex);
    })
    .on("mouseover", (event, d) => {
      tooltipTM
        .style("visibility", "visible")
        .html(
          `<strong>${
            d.data.name
          }</strong><br/>Valor: ${d.value.toLocaleString()}`
        );
    })
    .on("mousemove", (event) => {
      tooltipTM
        .style("top", event.pageY + 10 + "px")
        .style("left", event.pageX + 10 + "px");
    })
    .on("mouseout", () => {
      tooltipTM.style("visibility", "hidden");
    });

  // Desenha texto, com truncamento
  svgTM
    .selectAll(".treemap-label")
    .data(leaves)
    .join("text")
    .attr("class", "treemap-label")
    .attr("fill", "#000")
    .attr("font-size", "10px")
    .each(function (d) {
      const w = d.x1 - d.x0;
      const h = d.y1 - d.y0;

      // Se a caixa for muito pequena, não desenha texto algum
      if (w < 60 || h < 30) return;

      const splitted = d.data.name.split("->");
      const label1 = splitted[0].trim();
      const label2 = splitted[1] ? splitted[1].trim() : "";
      const xPos = d.x0 + 5;
      const yPos = d.y0 + 12;
      const maxWidth = w - 10; // deixar pequena margem

      const group = d3.select(this);

      // Linha 1 (origem)
      const line1 = group
        .append("tspan")
        .attr("x", xPos)
        .attr("y", yPos)
        .text(label1);

      // Trunca caso exceda
      truncateTspan(line1, maxWidth);

      // Linha 2 (destino), só se altura >= ~25 e label2 não vazio
      if (h > 25 && label2) {
        const line2 = group
          .append("tspan")
          .attr("x", xPos)
          .attr("dy", "1.2em")
          .text("-> " + label2);

        // Trunca a linha 2 também
        truncateTspan(line2, maxWidth);
      }
    });
}
