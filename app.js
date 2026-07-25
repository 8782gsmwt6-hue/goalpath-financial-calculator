const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
let mode = "time";
let lastProjection = null;
let homeGoalValue = null;

const defaults = {
  goalName: "Future Goal", goalAmount: 250000, startingBalance: 25000, lumpSum: 0,
  monthlyContribution: 1000, targetYears: 10, annualReturn: 7, annualFees: .15,
  inflationRate: 3, contributionGrowth: 0
};

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === id));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (id === "saved") renderSavedGoals();
}

$("modeTime").addEventListener("click", () => setMode("time"));
$("modeContribution").addEventListener("click", () => setMode("contribution"));
function setMode(nextMode) {
  mode = nextMode;
  $("modeTime").classList.toggle("active", mode === "time");
  $("modeContribution").classList.toggle("active", mode === "contribution");
  $("monthlyContributionLabel").classList.toggle("hidden", mode === "contribution");
  $("targetYearsLabel").classList.toggle("hidden", mode === "time");
}

function val(id) { return parseFloat($(id).value) || 0; }
function netMonthlyRate(annual, fees = 0) { return (annual - fees) / 100 / 12; }
function futureGoal(baseGoal, inflation, months, adjust) {
  return adjust ? baseGoal * Math.pow(1 + inflation / 100, months / 12) : baseGoal;
}
function monthlyPaymentForGoal(goal, principal, annualReturn, fees, months, timing = "end") {
  if (months <= 0) return 0;
  const r = netMonthlyRate(annualReturn, fees);
  const principalFV = principal * Math.pow(1 + r, months);
  let factor = r === 0 ? months : (Math.pow(1 + r, months) - 1) / r;
  if (timing === "beginning") factor *= (1 + r);
  return Math.max(0, (goal - principalFV) / factor);
}

function project({goal, principal, monthly, annualReturn, fees, inflation, adjustInflation, timing, contributionGrowth, maxMonths = 960, fixedMonths = null}) {
  const r = netMonthlyRate(annualReturn, fees);
  let balance = principal, contributions = principal, month = 0, currentMonthly = monthly;
  const rows = [{year: 0, balance, contributions, growth: 0, goal: futureGoal(goal, inflation, 0, adjustInflation)}];
  const limit = fixedMonths ?? maxMonths;
  while (month < limit) {
    month++;
    if (timing === "beginning") { balance += currentMonthly; contributions += currentMonthly; }
    balance *= (1 + r);
    if (timing === "end") { balance += currentMonthly; contributions += currentMonthly; }
    if (month % 12 === 0 && contributionGrowth > 0) currentMonthly *= (1 + contributionGrowth / 100);
    const target = futureGoal(goal, inflation, month, adjustInflation);
    if (month % 12 === 0 || month === limit || (!fixedMonths && balance >= target)) {
      rows.push({ year: month / 12, balance, contributions, growth: balance - contributions, goal: target });
    }
    if (!fixedMonths && balance >= target) break;
  }
  return {months: month, balance, contributions, growth: balance - contributions, target: futureGoal(goal, inflation, month, adjustInflation), rows, reached: balance >= futureGoal(goal, inflation, month, adjustInflation)};
}

$("goalForm").addEventListener("submit", e => { e.preventDefault(); calculateGoal(); });
function calculateGoal() {
  const goal = val("goalAmount");
  const principal = val("startingBalance") + val("lumpSum");
  const annualReturn = val("annualReturn");
  const fees = val("annualFees");
  const inflation = val("inflationRate");
  const adjustInflation = $("adjustForInflation").checked;
  const timing = $("contributionTiming").value;
  const contributionGrowth = val("contributionGrowth");
  let monthly = val("monthlyContribution");
  let projection;

  if (goal <= 0) return toast("Enter a goal amount greater than $0.");

  if (mode === "contribution") {
    const months = Math.max(1, Math.round(val("targetYears") * 12));
    const target = futureGoal(goal, inflation, months, adjustInflation);
    monthly = monthlyPaymentForGoal(target, principal, annualReturn, fees, months, timing);
    projection = project({ goal, principal, monthly, annualReturn, fees, inflation, adjustInflation, timing, contributionGrowth: 0, fixedMonths: months });
  } else {
    projection = project({ goal, principal, monthly, annualReturn, fees, inflation, adjustInflation, timing, contributionGrowth });
  }
  lastProjection = { ...projection, inputs: collectInputs(), monthly };
  renderResults(lastProjection);
}

function collectInputs() {
  return {
    name: $("goalName").value.trim() || "Financial Goal", mode,
    goal: val("goalAmount"), startingBalance: val("startingBalance"), lumpSum: val("lumpSum"),
    monthlyContribution: val("monthlyContribution"), targetYears: val("targetYears"),
    annualReturn: val("annualReturn"), fees: val("annualFees"), inflation: val("inflationRate"),
    adjustInflation: $("adjustForInflation").checked, timing: $("contributionTiming").value,
    contributionGrowth: val("contributionGrowth")
  };
}
function formatTime(months) {
  if (months >= 960) return "More than 80 years";
  const years = Math.floor(months / 12), rem = months % 12;
  return [years ? `${years} year${years === 1 ? "" : "s"}` : "", rem ? `${rem} month${rem === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ");
}
function healthScore(data) {
  let score = 100;
  if (!data.reached) score -= 45;
  if (data.inputs.annualReturn > 10) score -= 20;
  else if (data.inputs.annualReturn > 8) score -= 8;
  if (data.inputs.adjustInflation === false && data.months > 60) score -= 10;
  if (data.inputs.fees > 1) score -= 8;
  if (data.months > 360) score -= 15;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 90 ? "Excellent Position" : score >= 75 ? "On Track" : score >= 50 ? "Some Adjustment Needed" : score >= 25 ? "Meaningful Funding Gap" : "Major Plan Revision Needed";
  return {score, label};
}
function renderResults(data) {
  $("results").classList.remove("hidden");
  const name = data.inputs.name;
  if (mode === "contribution") {
    $("resultHeadline").textContent = `${money.format(data.monthly)} per month`;
    $("resultSummary").textContent = `Estimated recurring investment needed to fund “${name}” in ${formatTime(data.months)}.`;
  } else {
    $("resultHeadline").textContent = data.reached ? formatTime(data.months) : "Goal not reached within 80 years";
    $("resultSummary").textContent = data.reached ? `Estimated time to fund “${name}” using the assumptions entered.` : "Increase your investment, extend the time horizon, or revise the goal.";
  }
  const health = healthScore(data);
  $("healthBadge").textContent = `Goal Health: ${health.score}/100 — ${health.label}`;
  $("metricGoal").textContent = money.format(data.target);
  $("metricTime").textContent = formatTime(data.months);
  $("metricContributions").textContent = money.format(data.contributions);
  $("metricGrowth").textContent = money.format(data.growth);
  renderWarnings(data);
  renderScenarios(data);
  renderTable(data.rows);
  drawChart(data.rows);
  setTimeout(() => $("results").scrollIntoView({behavior: "smooth", block: "start"}), 50);
}
function renderWarnings(data) {
  const items = [];
  const r = data.inputs.annualReturn, inf = data.inputs.inflation;
  if (r > 10) items.push("The expected return is aggressive for long-term planning. Test a lower-return scenario.");
  else if (r < 3) items.push("The return assumption is conservative; confirm that it matches the investments you expect to use.");
  if (inf < 2) items.push("The inflation assumption is low for a long-term plan. Consider testing 3% or 4%.");
  if (!data.inputs.adjustInflation && data.months > 60) items.push("The goal is not inflation-adjusted, so its future purchasing power may be lower.");
  if (data.inputs.fees > 1) items.push("Annual fees above 1% can materially reduce long-term compounding.");
  if (!items.length) items.push("Your assumptions are within commonly tested planning ranges, but actual outcomes can still differ substantially.");
  $("assumptionWarnings").innerHTML = `<h3>Assumption check</h3><ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
}
function scenarioProjection(base, returnRate) {
  const i = base.inputs;
  if (i.mode === "contribution") {
    const months = Math.round(i.targetYears * 12);
    const target = futureGoal(i.goal, i.inflation, months, i.adjustInflation);
    const m = monthlyPaymentForGoal(target, i.startingBalance + i.lumpSum, returnRate, i.fees, months, i.timing);
    return {label: `${number.format(returnRate)}% return`, main: `${money.format(m)}/mo`, detail: formatTime(months)};
  }
  const p = project({goal:i.goal, principal:i.startingBalance+i.lumpSum, monthly:i.monthlyContribution, annualReturn:returnRate, fees:i.fees, inflation:i.inflation, adjustInflation:i.adjustInflation, timing:i.timing, contributionGrowth:i.contributionGrowth});
  return {label: `${number.format(returnRate)}% return`, main: p.reached ? formatTime(p.months) : "80+ years", detail: money.format(p.balance)};
}
function renderScenarios(data) {
  const base = data.inputs.annualReturn;
  const rates = [Math.max(-5, base - 3), base, Math.min(20, base + 3)];
  $("scenarioCards").innerHTML = rates.map((r, idx) => {
    const s = scenarioProjection(data, r);
    return `<article class="scenario"><span>${idx === 0 ? "Lower" : idx === 1 ? "Base" : "Higher"} scenario</span><strong>${s.main}</strong><small>${s.label} · ${s.detail}</small></article>`;
  }).join("");
}
function renderTable(rows) {
  $("projectionTable").innerHTML = rows.map(r => `<tr><td>${r.year === 0 ? "Start" : `Year ${Math.ceil(r.year)}`}</td><td>${money.format(r.contributions)}</td><td>${money.format(r.growth)}</td><td>${money.format(r.balance)}</td><td>${money.format(r.goal)}</td></tr>`).join("");
}
function drawChart(rows) {
  const canvas = $("growthChart"), ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1, width = canvas.clientWidth || 900, height = 360;
  canvas.width = width * dpr; canvas.height = height * dpr; ctx.scale(dpr, dpr);
  ctx.clearRect(0,0,width,height);
  const pad = {l:52,r:18,t:20,b:38}, w=width-pad.l-pad.r,h=height-pad.t-pad.b;
  const max = Math.max(...rows.map(r=>Math.max(r.balance,r.goal))) * 1.08 || 1;
  const maxYear = Math.max(...rows.map(r=>r.year)) || 1;
  const css = getComputedStyle(document.body);
  const muted = css.getPropertyValue("--muted"), border=css.getPropertyValue("--border"), primary=css.getPropertyValue("--primary"), accent=css.getPropertyValue("--accent");
  ctx.strokeStyle=border; ctx.fillStyle=muted; ctx.font="12px -apple-system, sans-serif";
  for(let i=0;i<=4;i++){ const y=pad.t+h-(h*i/4); ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(width-pad.r,y);ctx.stroke();ctx.fillText(money.format(max*i/4),4,y+4);}
  function line(key,color){ctx.beginPath();rows.forEach((r,i)=>{const x=pad.l+w*(r.year/maxYear),y=pad.t+h-h*(r[key]/max);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();}
  line("contributions", muted); line("balance", primary); line("goal", accent);
  ctx.fillStyle=muted;ctx.fillText("Contributions",pad.l, height-10);ctx.fillStyle=primary;ctx.fillText("Balance",pad.l+100,height-10);ctx.fillStyle=accent;ctx.fillText("Goal",pad.l+165,height-10);
}

$("homeForm").addEventListener("submit", e => { e.preventDefault(); calculateHome(); });
function calculateHome() {
  const price = val("homePrice"), years = val("homeYears"), appreciation = val("homeAppreciation")/100;
  const futurePrice = price * Math.pow(1+appreciation, years);
  const down = futurePrice * val("downPaymentPct")/100;
  const total = down + val("closingCosts") + val("repairReserve") + val("cashReserve");
  const months = Math.round(years*12), principal=val("homeCurrentBalance");
  const monthly = monthlyPaymentForGoal(total, principal, val("homeReturn"), val("homeFees"), months, "end");
  homeGoalValue = total;
  $("futureHomePrice").textContent=money.format(futurePrice);
  $("futureDownPayment").textContent=money.format(down);
  $("totalHomeGoal").textContent=money.format(total);
  $("homeMonthlyNeeded").textContent=`${money.format(monthly)}/mo`;
  const parts=[["Future down payment",down],["Closing costs",val("closingCosts")],["Furnishing / repairs",val("repairReserve")],["Additional reserve",val("cashReserve")]];
  $("homeBreakdown").innerHTML=parts.map(p=>`<div class="breakdown-row"><span>${p[0]}</span><strong>${money.format(p[1])}</strong></div>`).join("");
  $("homeResults").classList.remove("hidden");
}
$("useHomeGoal").addEventListener("click", () => {
  if (!homeGoalValue) calculateHome();
  $("goalName").value="Second Home";
  $("goalAmount").value=Math.round(homeGoalValue);
  $("startingBalance").value=val("homeCurrentBalance");
  $("annualReturn").value=val("homeReturn");
  $("annualFees").value=val("homeFees");
  $("targetYears").value=val("homeYears");
  setMode("contribution"); showView("planner"); toast("Second-home goal loaded into Goal Planner.");
});

$("saveGoal").addEventListener("click", () => {
  calculateGoal();
  if (!lastProjection) return;
  const saved = getSaved();
  saved.unshift({id:Date.now(), savedAt:new Date().toISOString(), ...lastProjection.inputs});
  localStorage.setItem("goalpath_goals", JSON.stringify(saved.slice(0,50)));
  toast("Goal saved on this device.");
});
function getSaved(){ try{return JSON.parse(localStorage.getItem("goalpath_goals"))||[]}catch{return[]}}
function renderSavedGoals(){
  const saved=getSaved(), el=$("savedGoalsList");
  if(!saved.length){el.innerHTML='<div class="card"><h3>No saved goals yet</h3><p>Calculate a goal and tap “Save Goal.”</p></div>';return;}
  el.innerHTML=saved.map(g=>`<article class="saved-goal card"><div><h3>${escapeHtml(g.name)}</h3><p>${money.format(g.goal)} goal · ${number.format(g.annualReturn)}% return · saved ${new Date(g.savedAt).toLocaleDateString()}</p></div><div class="saved-actions"><button data-load="${g.id}">Load</button><button data-delete="${g.id}">Delete</button></div></article>`).join("");
  el.querySelectorAll("[data-load]").forEach(b=>b.onclick=()=>loadSaved(Number(b.dataset.load)));
  el.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteSaved(Number(b.dataset.delete)));
}
function loadSaved(id){
  const g=getSaved().find(x=>x.id===id); if(!g)return;
  setMode(g.mode||"time"); $("goalName").value=g.name;$("goalAmount").value=g.goal;$("startingBalance").value=g.startingBalance;$("lumpSum").value=g.lumpSum;
  $("monthlyContribution").value=g.monthlyContribution;$("targetYears").value=g.targetYears;$("annualReturn").value=g.annualReturn;$("annualFees").value=g.fees;
  $("inflationRate").value=g.inflation;$("adjustForInflation").checked=g.adjustInflation;$("contributionTiming").value=g.timing;$("contributionGrowth").value=g.contributionGrowth;
  showView("planner"); calculateGoal(); toast("Saved goal loaded.");
}
function deleteSaved(id){localStorage.setItem("goalpath_goals",JSON.stringify(getSaved().filter(g=>g.id!==id)));renderSavedGoals();toast("Goal deleted.");}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

$("exportGoals").addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify({app:"GoalPath",version:1,exportedAt:new Date().toISOString(),goals:getSaved()},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`goalpath-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);
});
$("importGoals").addEventListener("change",async e=>{
  const file=e.target.files[0];if(!file)return;
  try{const data=JSON.parse(await file.text());if(!Array.isArray(data.goals))throw new Error();localStorage.setItem("goalpath_goals",JSON.stringify(data.goals));renderSavedGoals();toast("Backup imported.");}
  catch{toast("That file is not a valid GoalPath backup.");}
  e.target.value="";
});

document.querySelectorAll(".info-link").forEach(b=>b.addEventListener("click",()=>{showView("learn");setTimeout(()=>document.getElementById(`topic-${b.dataset.topic}`)?.scrollIntoView({behavior:"smooth",block:"center"}),100)}));
document.querySelectorAll("[data-set-field]").forEach(b=>b.addEventListener("click",()=>{const field=$(b.dataset.setField);if(field){field.value=b.dataset.value;showView(field.id==="homeAppreciation"?"home":"planner");toast(`${b.dataset.value}% assumption applied.`)}}));

$("resetGoal").addEventListener("click",()=>{Object.entries(defaults).forEach(([k,v])=>{if($(k))$(k).value=v});$("adjustForInflation").checked=false;setMode("time");$("results").classList.add("hidden");toast("Planner reset.");});
$("themeToggle").addEventListener("click",()=>{document.body.classList.toggle("dark");localStorage.setItem("goalpath_theme",document.body.classList.contains("dark")?"dark":"light");if(lastProjection)drawChart(lastProjection.rows)});
if(localStorage.getItem("goalpath_theme")==="dark")document.body.classList.add("dark");
function toast(message){const t=$("toast");t.textContent=message;t.classList.add("show");clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>t.classList.remove("show"),2500);}
window.addEventListener("resize",()=>{if(lastProjection)drawChart(lastProjection.rows)});
