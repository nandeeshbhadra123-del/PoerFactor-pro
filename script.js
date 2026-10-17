"use strict";

const $ = (id) => document.getElementById(id);

const form = $("calculatorForm");
const powerInput = $("power");
const existingInput = $("existingPF");
const targetInput = $("targetPF");
const voltageInput = $("voltage");
const phaseInput = $("phase");
const status = $("formStatus");

let chart = null;
let latestSummary = "";

const example = {
  power: "100",
  existingPF: "0.75",
  targetPF: "0.95",
  voltage: "415",
  phase: "3"
};

function format(value, digits = 2) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function readInputs() {
  return {
    power: powerInput.value.trim() === ""
      ? NaN : Number(powerInput.value),

    existingPF: existingInput.value.trim() === ""
      ? NaN : Number(existingInput.value),

    targetPF: targetInput.value.trim() === ""
      ? NaN : Number(targetInput.value),

    voltage: voltageInput.value.trim() === ""
      ? null : Number(voltageInput.value),

    phase: Number(phaseInput.value)
  };
}

function validate(data) {
  const errors = {};

  if (!Number.isFinite(data.power) || data.power <= 0) {
    errors.power = "Enter real power greater than zero.";
  }

  if (
    !Number.isFinite(data.existingPF) ||
    data.existingPF <= 0 ||
    data.existingPF > 1
  ) {
    errors.existingPF =
      "Power factor must be greater than 0 and at most 1.";
  }

  if (
    !Number.isFinite(data.targetPF) ||
    data.targetPF <= 0 ||
    data.targetPF > 1
  ) {
    errors.targetPF =
      "Power factor must be greater than 0 and at most 1.";
  } else if (
    Number.isFinite(data.existingPF) &&
    data.existingPF > 0 &&
    data.existingPF <= 1 &&
    data.targetPF <= data.existingPF
  ) {
    errors.targetPF =
      "Target PF must be higher than existing PF.";
  }

  if (
    data.voltage !== null &&
    (!Number.isFinite(data.voltage) || data.voltage <= 0)
  ) {
    errors.voltage =
      "Enter a positive voltage or leave it blank.";
  }

  return errors;
}

function showErrors(errors) {
  ["power", "existingPF", "targetPF", "voltage"].forEach((name) => {
    const field = $(name);
    const error = $(name + "Error");

    error.textContent = errors[name] || "";
    field.setAttribute(
      "aria-invalid",
      errors[name] ? "true" : "false"
    );
  });
}

function calculateValues(data) {
  const { power: p, existingPF: pf1, targetPF: pf2 } = data;

  const angle1 = Math.acos(pf1);
  const angle2 = Math.acos(pf2);

  const q1 = p * Math.tan(angle1);
  const q2 = p * Math.tan(angle2);
  const qc = Math.max(0, q1 - q2);

  const s1 = p / pf1;
  const s2 = p / pf2;

  const apparentReduction = s1 - s2;
  const reductionPercent = (apparentReduction / s1) * 100;

  let currentBefore = null;
  let currentAfter = null;

  if (data.voltage !== null) {
    const denominator =
      data.phase === 3
        ? Math.sqrt(3) * data.voltage
        : data.voltage;

    currentBefore = (s1 * 1000) / denominator;
    currentAfter = (s2 * 1000) / denominator;
  }

  return {
    p,
    pf1,
    pf2,
    q1,
    q2,
    qc,
    s1,
    s2,
    apparentReduction,
    reductionPercent,
    currentBefore,
    currentAfter,
    voltage: data.voltage,
    phase: data.phase
  };
}

function displayResults(r) {
  $("qcResult").textContent = format(r.qc);

  $("qcCaption").textContent =
    `Estimated compensation from PF ${r.pf1.toFixed(2)} ` +
    `to PF ${r.pf2.toFixed(2)}.`;

  $("s1Result").innerHTML =
    `${format(r.s1)} <small>kVA</small>`;

  $("s2Result").innerHTML =
    `${format(r.s2)} <small>kVA</small>`;

  $("q1Result").innerHTML =
    `${format(r.q1)} <small>kVAR</small>`;

  $("q2Result").innerHTML =
    `${format(r.q2)} <small>kVAR</small>`;

  $("reductionResult").textContent =
    `${format(r.apparentReduction)} kVA`;

  $("reductionPercent").textContent =
    `${format(r.reductionPercent, 1)}%`;

  if (r.voltage !== null) {
    $("currentBefore").textContent =
      `${format(r.currentBefore, 1)} A`;

    $("currentAfter").textContent =
      `${format(r.currentAfter, 1)} A`;

    $("currentNote").textContent =
      `Calculated at ${format(r.voltage, 1)} V, ` +
      `${r.phase === 3 ? "three-phase" : "single-phase"}.`;
  } else {
    $("currentBefore").textContent = "Not available";
    $("currentAfter").textContent = "Not available";

    $("currentNote").textContent =
      "Enter voltage to estimate supply current.";
  }

  // Update the visible calculation breakdown.
  $("formulaQ1").textContent =
    `Q₁ = ${format(r.p)} × tan(cos⁻¹(${r.pf1})) ` +
    `= ${format(r.q1)} kVAR`;

  $("formulaQ2").textContent =
    `Q₂ = ${format(r.p)} × tan(cos⁻¹(${r.pf2})) ` +
    `= ${format(r.q2)} kVAR`;

  $("formulaQc").textContent =
    `Qc = ${format(r.q1)} − ${format(r.q2)} ` +
    `= ${format(r.qc)} kVAR`;

  updateChart(r);
  makeSummary(r);
}

function updateChart(r) {
  const canvas = $("comparisonChart");

  if (typeof Chart === "undefined") {
    canvas.hidden = true;
    return;
  }

  canvas.hidden = false;

  const chartData = {
    labels: [
      "Reactive power (kVAR)",
      "Apparent power (kVA)"
    ],
    datasets: [
      {
        label: "Before correction",
        data: [r.q1, r.s1],
        backgroundColor: "#66a7ff",
        borderRadius: 5,
        barThickness: 20
      },
      {
        label: "After correction",
        data: [r.q2, r.s2],
        backgroundColor: "#42e6d0",
        borderRadius: 5,
        barThickness: 20
      }
    ]
  };

  if (chart) {
    chart.data = chartData;
    chart.update();
    return;
  }

  chart = new Chart(canvas, {
    type: "bar",
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) =>
              `${context.dataset.label}: ${format(context.raw)}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: "#23364b" },
          ticks: { color: "#8fa3ba", font: { size: 10 } }
        },
        y: {
          grid: { display: false },
          ticks: { color: "#b8c8d8", font: { size: 10 } }
        }
      }
    }
  });
}

function makeSummary(r) {
  latestSummary = [
    "PowerFactor Pro — Calculation Summary",
    `Real power: ${format(r.p)} kW`,
    `Existing power factor: ${r.pf1}`,
    `Target power factor: ${r.pf2}`,
    `Required capacitor compensation: ${format(r.qc)} kVAR`,
    `Existing reactive power: ${format(r.q1)} kVAR`,
    `Target reactive power: ${format(r.q2)} kVAR`,
    `Existing apparent power: ${format(r.s1)} kVA`,
    `Corrected apparent power: ${format(r.s2)} kVA`,
    `Apparent power reduction: ${format(r.apparentReduction)} kVA`,
    `Apparent power reduction: ${format(r.reductionPercent, 1)}%`,
    r.voltage !== null
      ? `Estimated current before: ${format(r.currentBefore, 1)} A`
      : "Current before: Voltage not provided",
    r.voltage !== null
      ? `Estimated current after: ${format(r.currentAfter, 1)} A`
      : "Current after: Voltage not provided",
    "",
    "Estimate only. A qualified electrical engineer must verify actual installation requirements."
  ].join("\n");
}

function clearResults() {
  latestSummary = "";

  [
    "qcResult",
    "s1Result",
    "s2Result",
    "q1Result",
    "q2Result",
    "reductionResult",
    "reductionPercent",
    "currentBefore",
    "currentAfter"
  ].forEach((id) => {
    $(id).textContent = "—";
  });

  $("qcCaption").textContent =
    "Correct the highlighted inputs to calculate.";

  $("currentNote").textContent =
    "Enter valid values to estimate supply current.";

  ["formulaQ1", "formulaQ2", "formulaQc"].forEach((id) => {
    $(id).textContent = "Waiting for valid inputs…";
  });

  if (chart) {
    chart.destroy();
    chart = null;
  }
}

function runCalculation(focusOnError = false) {
  const data = readInputs();
  const errors = validate(data);

  showErrors(errors);

  if (Object.keys(errors).length > 0) {
    clearResults();
    status.textContent = "Please correct the highlighted inputs.";

    if (focusOnError) {
      const firstInvalid = [
        "power",
        "existingPF",
        "targetPF",
        "voltage"
      ].find((name) => errors[name]);

      if (firstInvalid) $(firstInvalid).focus();
    }

    return;
  }

  const result = calculateValues(data);
  displayResults(result);

  status.textContent = "Calculation updated successfully.";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runCalculation(true);
});

$("exampleBtn").addEventListener("click", () => {
  Object.entries(example).forEach(([key, value]) => {
    $(key).value = value;
  });

  runCalculation();
  status.textContent = "Example values loaded.";
});

$("resetBtn").addEventListener("click", () => {
  form.reset();

  powerInput.value = "";
  existingInput.value = "";
  targetInput.value = "";
  voltageInput.value = "";
  phaseInput.value = "3";

  showErrors({});
  clearResults();

  status.textContent = "Form reset. Enter new values.";
  powerInput.focus();
});

$("copyBtn").addEventListener("click", async () => {
  if (!latestSummary) {
    status.textContent =
      "Enter valid values before copying results.";
    return;
  }

  try {
    await navigator.clipboard.writeText(latestSummary);
    status.textContent = "Calculation summary copied.";
  } catch {
    const textarea = document.createElement("textarea");

    textarea.value = latestSummary;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    status.textContent = copied
      ? "Calculation summary copied."
      : "Copy failed. Please copy the results manually.";
  }
});

$("downloadBtn").addEventListener("click", () => {
  if (!latestSummary) {
    status.textContent =
      "Enter valid values before downloading.";
    return;
  }

  const report = [
    "POWERFACTOR PRO",
    "Power Factor Correction Report",
    "================================",
    "",
    latestSummary,
    "",
    "Calculation method:",
    "Qc = P × [tan(acos(PF1)) − tan(acos(PF2))]",
    "",
    "Note: This is an estimate, not a final installation design."
  ].join("\n");

  const blob = new Blob([report], {
    type: "text/plain;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "powerfactor-report.txt";

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  status.textContent = "Your report has been downloaded.";
});

// Register listeners only once.
["power", "existingPF", "targetPF", "voltage", "phase"]
  .forEach((id) => {
    $(id).addEventListener("input", () => runCalculation());
    $(id).addEventListener("change", () => runCalculation());
  });

// Show the initial example when the page opens.
runCalculation();