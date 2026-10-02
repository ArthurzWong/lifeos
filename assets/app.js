/* ============================================================
   LIFEOS — AI Emergency & Recovery Coordinator (prototype)
   Static demo. Synthetic data only. No real patient records.
   ============================================================ */
"use strict";

/* ---------------- utilities ---------------- */
const $ = (s, el) => (el || document).querySelector(s);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0"); };
const todayISO = () => new Date().toISOString().slice(0,10);
const uid = (p) => p + "-" + Math.random().toString(36).slice(2,8).toUpperCase();
const dayLabel = (n) => n === 0 ? "Today" : (n === 1 ? "Tomorrow" : "Day " + n);
const sv = (el, block) => { try { if (el && el.scrollIntoView) el.scrollIntoView({ behavior:"smooth", block: block || "end" }); } catch(e){} };

function toast(msg){
  const t = h('<div class="toast"></div>'); t.textContent = msg; $("#toast-root").appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function modal(title, bodyEl, actions){
  const bg = h('<div class="modal-bg"></div>');
  const m = h('<div class="modal" role="dialog" aria-modal="true"></div>');
  m.appendChild(h("<h3>" + esc(title) + "</h3>"));
  if (typeof bodyEl === "string") m.appendChild(h("<div>" + bodyEl + "</div>")); else m.appendChild(bodyEl);
  const row = h('<div class="mrow"></div>');
  (actions || [{ label:"Close" }]).forEach(a => {
    const b = h('<button class="btn ' + (a.cls || "") + '"></button>'); b.textContent = a.label;
    b.onclick = () => { if (!a.keepOpen) bg.remove(); if (a.onClick) a.onClick(m); };
    row.appendChild(b);
  });
  m.appendChild(row); bg.appendChild(m); bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  $("#overlay-root").appendChild(bg); return bg;
}

/* ---------------- persistent state ---------------- */
const LS_KEY = "lifeos_state_v1";
let S = null;

function defaultState(){
  return {
    mode: "entry",                 // entry | active
    flow: null,                    // triage selection in progress
    emergency: null,               // emergency-mode answers
    caseId: null,
    createdAt: null,
    demoMode: true,
    tab: "home",
    caseState: null,               // structured CASE_STATE
    tasks: [],
    timeline: [],
    documents: [],
    approvals: [],
    audit: [],
    family: [],
    actionCounters: { family:1, insurer:1, employer:1 },
    aiTurn: 0
  };
}
function save(){ try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch(e){} }
function load(){
  try { const raw = localStorage.getItem(LS_KEY); if (raw){ const v = JSON.parse(raw); if (v && v.caseId !== undefined) return v; } } catch(e){}
  return null;
}
function resetAll(){
  S = defaultState(); save(); render();
  toast("Demo reset. Synthetic data cleared.");
}
function audit(event, detail){
  S.audit.unshift({ id: uid("AUD"), event, detail: detail || "", at: new Date().toISOString() });
  if (S.audit.length > 120) S.audit.length = 120;
  save();
}

/* ---------------- knowledge layer (RAG stub) ---------------- */
const KNOWLEDGE = [
  { id:"mers999", source_name:"Malaysia NG MERS 999 (MCMC)", url:"https://www.mcmc.gov.my/en/sectors/communications-services/999", jurisdiction:"MY",
    effective_date:"2025-06-01", confidence:"high", retrieved_at:"2026-09-20",
    note:"999 is Malaysia's national emergency line (MERS 999) for police, ambulance and fire. Calls are free from any phone." },
  { id:"saveme", source_name:"SaveME 999 app (Ministry of Communications)", url:"https://www.mcmc.gov.my", jurisdiction:"MY",
    effective_date:"2025-06-01", confidence:"high", retrieved_at:"2026-09-20",
    note:"SaveME 999 is the official mobile app for contacting MERS 999 with location data when voice calls are difficult." },
  { id:"bnmclaim", source_name:"Bank Negara Malaysia — insurance complaints & claims guidance", url:"https://www.bnm.gov.my/consumers", jurisdiction:"MY",
    effective_date:"2025-01-01", confidence:"medium", retrieved_at:"2026-09-20",
    note:"Insurers must acknowledge claims and keep you informed; unresolved disputes can be escalated to BNM's LIT (Laman Informasi & Nasihat Teknikal) process." },
  { id:"glpractice", source_name:"Industry practice — Guarantee Letter (GL) admissions", url:"https://www.bnm.gov.my/consumers", jurisdiction:"MY",
    effective_date:"2025-01-01", confidence:"medium", retrieved_at:"2026-09-20",
    note:"For planned admissions at panel hospitals, insurers typically issue a Guarantee Letter to the hospital covering approved treatment costs. Requirements vary by policy. Confirm with your insurer." },
  { id:"medrep", source_name:"Hospitals (public information)", url:"https://www.moh.gov.my", jurisdiction:"MY",
    effective_date:"2025-01-01", confidence:"medium", retrieved_at:"2026-09-20",
    note:"Medical reports, itemised bills and imaging reports are the documents most commonly required for accident & injury claims." }
];
function knowledgeFor(topic){
  const map = { "999":["mers999","saveme"], "insurance":["bnmclaim","glpractice"], "documents":["medrep","bnmclaim"], "hospital":["medrep"] };
  const ids = map[topic] || [];
  return ids.map(i => KNOWLEDGE.find(k => k.id === i)).filter(Boolean);
}

/* ---------------- Malaysia directory (admin-managed sample; verify before use) ---------------- */
const DIRECTORY = [
  { cat:"Emergency Line", name:"MERS 999 (Police / Ambulance / Fire)", contact:"999", verified:"National emergency line. Calls are free.", admin:true },
  { cat:"Emergency Line", name:"SaveME 999 (mobile app)", contact:"App — iOS / Android", verified:"Official app to reach MERS 999 with location when calling is difficult.", admin:true },
  { cat:"Government Hospital", name:"Hospital Kuala Lumpur", contact:"Directory via MOH — verify before use", verified:"Sample entry — verify current details.", admin:true },
  { cat:"Government Hospital", name:"Hospital Putrajaya", contact:"Directory via MOH — verify before use", verified:"Sample entry — verify current details.", admin:true },
  { cat:"Private Hospital", name:"Demo Hospital Klang Valley", contact:"+60 3-XXXX XXXX (sample)", verified:"Synthetic demo hospital for the prototype.", admin:false },
  { cat:"Ambulance", name:"Demo Ambulance Services", contact:"+60 1X-XXX XXXX (sample)", verified:"Non-emergency transfer sample listing.", admin:false },
  { cat:"Insurance", name:"Demo Insurance Berhad", contact:"Claims hotline — sample", verified:"Synthetic insurer used in demo scenario.", admin:false },
  { cat:"Takaful", name:"Demo Takaful (Klang Valley)", contact:"Claims hotline — sample", verified:"Synthetic takaful operator sample.", admin:false },
  { cat:"Physiotherapy", name:"Demo Physio Centre (Petaling Jaya)", contact:"By appointment — sample", verified:"Sample physiotherapy provider.", admin:false },
  { cat:"Medical Equipment", name:"Demo Mobility Store", contact:"Rental & sale — sample", verified:"Wheelchairs, walkers, home ramps — sample.", admin:false },
  { cat:"Home Nursing", name:"Demo Home Care Team", contact:"By arrangement — sample", verified:"Post-discharge home nursing sample.", admin:false },
  { cat:"Wheelchair Transport", name:"Demo Medical Transport", contact:"Booking — sample", verified:"Wheelchair-accessible transport sample.", admin:false },
  { cat:"Pharmacy", name:"Demo Pharmacy (Bukit Bintang)", contact:"Walk-in — sample", verified:"Prescription refill sample.", admin:false },
  { cat:"Medical Companions", name:"Demo Companion Care", contact:"Booking — sample", verified:"Trained hospital companions — sample.", admin:false }
];
const DIR_STAMP = "Data valid as of 2026-09-20. Confirm contact details before relying on them.";

/* ---------------- templates ---------------- */
const TEMPLATES = {
  family: { title:"Message to family", body:"Hi, I'm at [hospital] after an accident. I'm currently being assessed. LIFEOS is helping organize the information. I'll update you when I know more." },
  insurer: { title:"Message to insurer", body:"Hello, I am currently admitted to [hospital] following an accident on [date]. I would like to confirm coverage, panel status and the process for obtaining a Guarantee Letter." },
  employer: { title:"Message to employer", body:"I was involved in an accident and am currently receiving medical treatment. I will provide the medical documentation and expected recovery period once confirmed by the hospital." }
};
function fillTemplate(kind){
  const t = TEMPLATES[kind];
  const cs = S.caseState || {};
  return t.body
    .replace("[hospital]", cs.hospital && cs.hospital !== "Not yet known" ? cs.hospital : "[hospital]")
    .replace("[date]", cs.incident_date || "[date]");
}
function templateModal(kind){
  const t = TEMPLATES[kind];
  const box = h('<div><label class="label">Draft — review and edit before sending. Nothing is sent automatically.</label><textarea class="input" rows="7"></textarea><div class="notice amber mt"><span class="ic">⚠️</span><span>Prototype: sending is not connected. Copy the text and send it yourself, or approve it as a logged action.</span></div></div>');
  const ta = $("textarea", box); ta.value = fillTemplate(kind);
  modal(t.title, box, [
    { label:"Copy text", onClick: (m) => { ta.select(); try{ document.execCommand("copy"); toast("Copied to clipboard."); }catch(e){ toast("Select and copy manually."); } }, keepOpen:true, cls:"ghost" },
    { label:"Approve & log", cls:"primary", onClick: () => {
        const n = S.actionCounters[kind] || 1; S.actionCounters[kind] = n + 1;
        createApproval("communication", t.title + " #" + n, "User asked LIFEOS to prepare this message from a template.", ta.value, "APPROVED");
        audit("MESSAGE_SENT", t.title + " (draft approved in prototype)");
        render();
      } },
    { label:"Cancel" }
  ]);
}

/* ---------------- AI coordinator ---------------- */
const SOURCE_TAGS = {
  fact:      { label:"FACT", cls:"teal" },
  user:      { label:"USER-PROVIDED", cls:"grey" },
  verified:  { label:"VERIFIED SOURCE", cls:"brand" },
  guidance:  { label:"AI-GENERATED GUIDANCE", cls:"amber" },
  confirm:   { label:"REQUIRES PROFESSIONAL CONFIRMATION", cls:"red" }
};
function srcTags(list){
  return '<div class="src">' + list.map(k => { const t = SOURCE_TAGS[k]; return '<span class="pill ' + t.cls + '">' + t.label + "</span>"; }).join("") + "</div>";
}

function aiAnswer(q){
  const cs = S.caseState;
  const s = q.toLowerCase();
  if (/999|emergency|ambulance/.test(s)) return {
    text: "If there is immediate danger — unconsciousness, heavy bleeding, breathing difficulty or severe head injury — call 999 now (Malaysia MERS 999). SaveME 999 is the official app alternative when a voice call is hard.\n\nIf the situation is already stable and you are at hospital, LIFEOS focuses on coordination: assessment, insurance and family updates.",
    tags:["fact","verified"], topic:"999", actions:["call999","openSaveMe"] };
  if (/insur|claim|cover|policy|GL|guarantee/.test(s)) {
    const missing = S.tasks.filter(t => t.group==="Insurance" && !t.done).length;
    return {
      text: "Your policy may cover this — confirm with your insurer; LIFEOS never assumes approval.\n\nTypical accident-claim path in Malaysia:\n1. Confirm the policy and whether " + (cs ? cs.hospital : "the hospital") + " is a panel hospital.\n2. Ask the insurer what documents they require for your policy type.\n3. Request a Guarantee Letter (GL) for admission if needed.\n4. Submit claim documents and track status.\n\nYour claim checklist has " + missing + " item(s) still open. The most commonly required items are the medical report, itemised bill and original receipts.",
      tags:["guidance","confirm","verified"], topic:"insurance", actions:["gotoInsurance","prepareClaim","requestGL"] };
  }
  if (/ask|question|surgeon|doctor/.test(s)) return {
    text: "Open Prepare for Doctor — it builds the question list from what is actually known in the case so far, grouped into diagnosis, procedure, risks, recovery, medication and costs.\n\nGood baseline questions before any surgery:\n• What exactly is the procedure, and who will perform it?\n• What are the main risks and how are they managed?\n• What does recovery look like at 1 week and 6 weeks?\n• What documents will I receive for insurance?",
    tags:["guidance","confirm"], topic:"hospital", actions:["gotoDoctor"] };
  if (/document|keep|record|bill|receipt|report/.test(s)) return {
    text: "Keep every original document. For an accident claim, insurers most commonly ask for:\n• Identity document\n• Hospital admission record\n• Medical report\n• X-ray / imaging report\n• Itemised bill and original receipts\n• Police report (for traffic or third-party incidents)\n\nUpload each to the Document Vault as soon as you receive it — originals stay untouched; LIFEOS only extracts fields.",
    tags:["guidance","verified"], topic:"documents", actions:["gotoDocs"] };
  if (/who should i (tell|inform)|notify|inform|family|employer|wife|husband|spouse/.test(s)) return {
    text: "Based on your Family Circle and permissions, the usual order is:\n1. Primary contact (spouse/partner) — status update.\n2. Insurer — coverage confirmation and GL request (time-sensitive).\n3. Employer — sick-leave notification, medical certificate to follow.\n\nEach message is drafted for your review first. Nothing is sent without your approval.",
    tags:["guidance"], topic:"hospital", actions:["draftFamily","draftInsurer","draftEmployer","gotoActions"] };
  if (/surgery|after surgery|operation|procedure/.test(s)) return {
    text: "After a typical orthopaedic surgery the coordination track is:\n• Day 0 — post-op instructions, medication list, dressing care.\n• Day 1–2 — mobilisation plan, discharge checklist starts.\n• Week 1 — follow-up appointment, wound review.\n• Week 2–6 — physiotherapy plan.\n\nYour clinician's instructions always override anything LIFEOS shows. I track the coordination tasks — not the medical decisions.",
    tags:["guidance","confirm"], topic:"hospital", actions:["gotoRecovery"] };
  if (/explain what the doctor said|explain what/.test(s)) return {
    text: "Paste or type what the doctor said and I will rewrite it in plain language, split into: what happened, what happens next, what to watch for, and what to ask. I will mark anything that needs the care team's confirmation rather than guessing.",
    tags:["guidance","confirm"], topic:"hospital", actions:[] };
  if (/transport|home|wheelchair|taxi|grab/.test(s)) return {
    text: "For discharge-day transport: if weight-bearing is restricted, book wheelchair-accessible medical transport rather than a regular ride. Check the Malaysia Directory tab for sample providers, and add it as a discharge task so it is not forgotten on the day.",
    tags:["guidance"], topic:"hospital", actions:["gotoTasks","gotoDirectory"] };
  return {
    text: "I coordinate, I do not diagnose. Here is what I can do right now:\n• Prepare for Doctor — build your question list\n• Insurance & Claims — coverage, GL, claim checklist\n• Document Vault — what to keep and upload\n• Family updates — drafts you approve\nAsk me about any of these, or tap a suggestion below.",
    tags:["guidance"], topic:"hospital", actions:["gotoDoctor","gotoInsurance","gotoDocs"] };
}
function renderMsg(text, tags, actions, who){
  const m = h('<div class="msg ' + who + '"></div>');
  m.appendChild(document.createTextNode(text));
  if (tags && tags.length) m.appendChild(h(srcTags(tags)));
  if (actions && actions.length){
    const row = h('<div class="row mt"></div>');
    const labels = { call999:"Call 999", openSaveMe:"Open Save ME 999", gotoInsurance:"Open Insurance & Claims", prepareClaim:"Prepare claim", requestGL:"Request GL", gotoDoctor:"Prepare for Doctor", gotoDocs:"Document Vault", draftFamily:"Draft family update", draftInsurer:"Draft insurer message", draftEmployer:"Draft employer message", gotoActions:"Action Center", gotoRecovery:"Recovery plan", gotoTasks:"All tasks", gotoDirectory:"Malaysia Directory" };
    actions.forEach(a => {
      const b = h('<button class="btn sm ' + (a==="call999"?"danger":"") + '"></button>'); b.textContent = labels[a] || a;
      b.onclick = () => handleAiAction(a); row.appendChild(b);
    });
    m.appendChild(row);
  }
  return m;
}
function handleAiAction(a){
  if (a === "call999"){ location.href = "tel:999"; audit("ACTION_EXECUTED","User tapped Call 999"); return; }
  if (a === "openSaveMe"){ modal("Save ME 999", "<p>The SaveME 999 app is the official channel to reach Malaysia's MERS 999 with your location when a voice call is difficult. On a real phone, install it from your app store. (Prototype: app store link disabled.)</p>", [{label:"Got it", cls:"primary"}]); return; }
  if (a === "gotoInsurance"){ S.tab="case"; save(); render(); setTimeout(()=>{ const el=$("#mod-insurance"); if(el) el.scrollIntoView({behavior:"smooth"}); },60); return; }
  if (a === "gotoDoctor"){ doctorModal(); return; }
  if (a === "gotoDocs"){ S.tab="documents"; save(); render(); return; }
  if (a === "gotoActions"){ S.tab="actions"; save(); render(); return; }
  if (a === "gotoRecovery"){ S.tab="recovery"; save(); render(); return; }
  if (a === "gotoTasks"){ S.tab="case"; save(); render(); setTimeout(()=>{ const el=$("#mod-tasks"); if(el) el.scrollIntoView({behavior:"smooth"}); },60); return; }
  if (a === "gotoDirectory"){ S.tab="directory"; save(); render(); return; }
  if (a === "prepareClaim"){ S.tab="case"; save(); render(); setTimeout(()=>{ const el=$("#mod-insurance"); if(el) el.scrollIntoView({behavior:"smooth"}); },60); return; }
  if (a === "requestGL"){ S.tab="case"; save(); render(); setTimeout(()=>{ const el=$("#mod-insurance"); if(el) el.scrollIntoView({behavior:"smooth"}); },60); requestGLFlow(); return; }
  if (a === "draftFamily"){ templateModal("family"); return; }
  if (a === "draftInsurer"){ templateModal("insurer"); return; }
  if (a === "draftEmployer"){ templateModal("employer"); return; }
}

/* ---------------- core factories ---------------- */
function newCase(){
  const id = "LX-" + Math.floor(100000 + Math.random()*900000);
  S.caseId = id; S.createdAt = new Date().toISOString(); S.mode = "active"; S.tab = "home";
  S.caseState = {
    patient: { name:"Daniel Tan", dob:"1989-04-12", relation:"Friend", blood_type:"O+", allergies:"None known", conditions:"None reported", medications:"None reported", id_no:"Demo — NRIC on file" },
    incident: { type:"Slip and fall", time:"10:30", date: todayISO(), location:"Taman Tun Dr Ismail, Kuala Lumpur (home staircase)", reported_by:"Arthur Wong (friend)", description:"Slipped on wet stairs, landed on right leg. Conscious throughout. Unable to bear weight on the right leg. Suspected fracture." },
    emergency_flags: [],
    urgency: "Non-life-threatening — urgent orthopaedic assessment",
    status: "At hospital — awaiting assessment",
    stage: 1,
    hospital: "Demo Hospital Klang Valley",
    doctor: "Dr. Lim — Orthopaedics (assessment pending)",
    diagnosis_verified: false,
    diagnosis: "Suspected right leg fracture — not yet confirmed",
    procedure: "TBD — surgery possible",
    surgery_scheduled: false,
    surgery_time: null,
    admitted: true,
    admission_no: "Demo — admission slip on file",
    insurance: { provider:"Demo Insurance Berhad", policy_number:"DEMO-88-445512", policy_type:"Medical card + personal accident rider", agent:"Sam Lim (agent) — sample", contact:"Claims hotline — sample", panel_hospital:"Demo Hospital: listed as panel (sample data)", coverage_notes:"Accident-related admission usually eligible for GL; confirm entitlements with insurer.", claim_status:"Not started", gl_status:"Not requested", documents_required:["Identity document","Hospital admission record","Medical report","X-ray / imaging report","Itemised bill","Original receipts"] },
    claim: { readiness:0, missing:[] },
    family: [],
    permissions: [],
    discharge_ready: false,
    recovery: null
  };
  S.timeline = [
    { t:"10:32", title:"Incident reported", detail:"Fall reported by Arthur Wong via LIFEOS.", minor:false },
    { t:"10:45", title:"Family notified", detail:"Primary contact informed of the fall and hospital transfer.", minor:true },
    { t:"11:10", title:"Hospital arrival", detail:"Arrived at Demo Hospital Klang Valley emergency department.", minor:false }
  ];
  S.tasks = [
    { id:uid("T"), group:"Urgent", title:"Confirm doctor assessment", owner:"Patient / companion", status:"open", deadline:"Today", source:"LIFEOS triage", perm:"none", done:false },
    { id:uid("T"), group:"Urgent", title:"Confirm whether surgery is required", owner:"Dr. Lim (orthopaedics)", status:"open", deadline:"Today", source:"LIFEOS triage", perm:"none", done:false },
    { id:uid("T"), group:"Insurance", title:"Identify insurance policy", owner:"Arthur (friend)", status:"done", deadline:"Today", source:"Insurance profile selected in demo", perm:"none", done:true },
    { id:uid("T"), group:"Insurance", title:"Check panel hospital status", owner:"Arthur (friend)", status:"open", deadline:"Today", source:"Insurance module", perm:"none", done:false },
    { id:uid("T"), group:"Insurance", title:"Contact insurer", owner:"Arthur (friend)", status:"open", deadline:"Today", source:"Insurance module", perm:"none", done:false },
    { id:uid("T"), group:"Insurance", title:"Request Guarantee Letter (GL)", owner:"Arthur (friend)", status:"open", deadline:"Before procedures", source:"Insurance module", perm:"insurance", done:false },
    { id:uid("T"), group:"Documents", title:"Hospital admission record", owner:"Arthur (friend)", status:"open", deadline:"Today", source:"Claim requirements (sample)", perm:"none", done:false },
    { id:uid("T"), group:"Documents", title:"X-ray / imaging report", owner:"Hospital", status:"open", deadline:"After imaging", source:"Claim requirements (sample)", perm:"none", done:false },
    { id:uid("T"), group:"Documents", title:"Medical report", owner:"Treating doctor", status:"open", deadline:"At discharge", source:"Claim requirements (sample)", perm:"none", done:false },
    { id:uid("T"), group:"Documents", title:"Itemised bill", owner:"Hospital finance", status:"open", deadline:"At discharge", source:"Claim requirements (sample)", perm:"none", done:false },
    { id:uid("T"), group:"Documents", title:"Original receipts", owner:"Patient / family", status:"open", deadline:"Keep all", source:"Claim requirements (sample)", perm:"none", done:false },
    { id:uid("T"), group:"Family", title:"Notify spouse", owner:"LIFEOS draft → Arthur approves", status:"open", deadline:"Today", source:"Family Circle", perm:"family", done:false },
    { id:uid("T"), group:"Family", title:"Notify children (if applicable)", owner:"LIFEOS draft → Arthur approves", status:"open", deadline:"Today", source:"Family Circle", perm:"family", done:false },
    { id:uid("T"), group:"Discharge", title:"Transport home", owner:"TBD", status:"open", deadline:"Discharge day", source:"Discharge planning", perm:"none", done:false },
    { id:uid("T"), group:"Discharge", title:"Mobility equipment", owner:"TBD", status:"open", deadline:"Discharge day", source:"Discharge planning", perm:"none", done:false },
    { id:uid("T"), group:"Discharge", title:"Follow-up appointment", owner:"Patient", status:"open", deadline:"At discharge", source:"Discharge planning", perm:"none", done:false },
    { id:uid("T"), group:"Discharge", title:"Physiotherapy plan", owner:"Patient", status:"open", deadline:"Week 1", source:"Discharge planning", perm:"none", done:false }
  ];
  S.family = [
    { id:uid("F"), name:"Mei Tan", role:"Primary Contact", relation:"Spouse", phone:"+60 12-XXX XXXX (sample)", perms:{ VIEW_STATUS:true, VIEW_MEDICAL:false, VIEW_FINANCIAL:false, VIEW_DOCUMENTS:true, RECEIVE_ALERTS:true, ACT_ON_BEHALF:false } },
    { id:uid("F"), name:"Arthur Wong", role:"Reporter / Caregiver", relation:"Friend", phone:"This device", perms:{ VIEW_STATUS:true, VIEW_MEDICAL:true, VIEW_FINANCIAL:true, VIEW_DOCUMENTS:true, RECEIVE_ALERTS:true, ACT_ON_BEHALF:true } },
    { id:uid("F"), name:"Sam Lim", role:"Insurance Agent", relation:"Agent", phone:"Sample contact", perms:{ VIEW_STATUS:true, VIEW_MEDICAL:false, VIEW_FINANCIAL:true, VIEW_DOCUMENTS:true, RECEIVE_ALERTS:true, ACT_ON_BEHALF:false } }
  ];
  S.documents = [
    { id:uid("D"), name:"Daniel Tan — NRIC (front)", type:"Identity", mime:"image", date:todayISO(), ocr:{ document_type:"Identity card", patient:"Daniel Tan", hospital:"—", doctor:"—", amount:"—", policy:"—", claim_reference:"—" } },
    { id:uid("D"), name:"Demo Insurance — policy summary", type:"Insurance", mime:"pdf", date:todayISO(), ocr:{ document_type:"Policy document", patient:"Daniel Tan", hospital:"—", doctor:"—", amount:"—", policy:"DEMO-88-445512", claim_reference:"—" } }
  ];
  S.approvals = [];
  audit("CASE_CREATED", "Case " + id + " created (demo scenario)");
  audit("LOGIN", "Demo session started");
  save();
}
function createApproval(kind, title, reason, dataPayload, initialStatus){
  const a = { id:uid("A"), kind, title, reason, data:dataPayload, target: kind==="family" ? "Mei Tan (Primary Contact)" : kind==="insurer" ? "Demo Insurance Berhad — claims" : kind==="employer" ? "HR — sample" : "—", status: initialStatus || "PENDING", created_at:new Date().toISOString(), log:[ "Created by LIFEOS (" + nowHM() + ")", "Awaiting human review" ] };
  S.approvals.unshift(a);
  audit(initialStatus === "APPROVED" ? "ACTION_APPROVED" : "ACTION_DRAFTED", a.title);
  save();
  return a;
}
function addTimeline(title, detail, minor){ S.timeline.push({ t: nowHM(), title, detail: detail || "", minor: !!minor }); save(); }

/* ---------------- claim readiness ---------------- */
function requiredDocs(){
  return (S.caseState && S.caseState.insurance.documents_required) || [];
}
function claimDocs(){
  return S.documents.filter(d => ["Identity","Insurance","Medical","X-ray","Hospital bill","Receipt","Police report","Discharge"].includes(d.type));
}
function readiness(){
  const req = requiredDocs();
  const have = new Set();
  claimDocs().forEach(d => have.add(d.type));
  const haveTypes = [];
  const missing = [];
  const typeMap = { "Identity document":"Identity", "Hospital admission record":"Medical", "Medical report":"Medical", "X-ray / imaging report":"X-ray", "Itemised bill":"Hospital bill", "Original receipts":"Receipt", "Police report":"Police report", "Discharge summary":"Discharge" };
  req.forEach(r => { (have.has(typeMap[r] || r) ? haveTypes : missing).push(r); });
  const pct = req.length ? Math.round(haveTypes.length / req.length * 100) : 0;
  return { pct, haveTypes, missing };
}

/* ================================================================
   RENDER
   ================================================================ */
function render(){
  const app = $("#app");
  if (!S.mode || S.mode === "entry"){ app.innerHTML = ""; app.appendChild(entryScreen()); return; }
  app.innerHTML = "";
  app.appendChild(topbar());
  app.appendChild(mainnav());
  const page = h('<div class="page"></div>');
  const tabs = { home:tabHome, case:tabCase, actions:tabActions, documents:tabDocuments, family:tabFamily, recovery:tabRecovery, directory:tabDirectory, audit:tabAudit };
  (tabs[S.tab] || tabHome)(page);
  app.appendChild(page);
  app.appendChild(footerEl());
}

/* ---------------- topbar & nav ---------------- */
function topbar(){
  const cs = S.caseState || {};
  const bar = h('<header class="topbar"><div class="topbar-in"></div></header>');
  const inr = $(".topbar-in", bar);
  inr.appendChild(h('<div class="logo"><div class="mark">L</div><div>LIFEOS<small>' + esc(cs.hospital ? "Case " + S.caseId : "AI Emergency & Recovery Coordinator") + "</small></div></div>"));
  const tags = h('<div class="top-tags"></div>');
  if (S.demoMode) tags.appendChild(h('<span class="tag demo">DEMO — SYNTHETIC DATA</span>'));
  const rb = h('<button class="btn sm ghost" id="resetBtn">Reset demo</button>');
  rb.onclick = confirmReset;
  tags.appendChild(rb);
  inr.appendChild(tags);
  return bar;
}
function confirmReset(){
  modal("Reset the demo?", "<p>This clears the case, tasks, documents and audit trail stored in this browser, and returns LIFEOS to the welcome screen. Synthetic data only — nothing real is affected.</p>", [
    { label:"Cancel" },
    { label:"Reset demo", cls:"danger", onClick: resetAll }
  ]);
}
function mainnav(){
  const nav = h('<nav class="mainnav"></nav>');
  const items = [
    ["home","Home"], ["case","Case"], ["actions","Actions"], ["documents","Documents"], ["family","Family"], ["recovery","Recovery"], ["directory","Directory"], ["audit","Audit"]
  ];
  const pending = S.approvals.filter(a => a.status === "PENDING").length;
  const docsN = S.documents.length;
  items.forEach(([id, label]) => {
    const b = h('<button class="' + (S.tab===id?"on":"") + '"></button>');
    b.textContent = label;
    if (id === "actions" && pending) { b.classList.add("nb"); b.appendChild(h('<span class="navdot">' + pending + "</span>")); }
    if (id === "documents" && docsN) { b.classList.add("nb"); b.appendChild(h('<span class="navdot" style="background:#2b7fbf">' + docsN + "</span>")); }
    b.onclick = () => { S.tab = id; save(); render(); window.scrollTo({top:0}); };
    nav.appendChild(b);
  });
  return nav;
}
function footerEl(){
  const f = h('<footer class="footer"></footer>');
  f.appendChild(h("<p><b>LIFEOS</b> is a coordination prototype. It is not a medical device, insurer, law firm or emergency service. Always call 999 for emergencies in Malaysia. AI output is guidance and may require professional confirmation.</p>"));
  f.appendChild(h('<p class="mt">' + esc(DIR_STAMP) + "</p>"));
  return f;
}

/* ================================================================
   ENTRY / TRIAGE
   ================================================================ */
function entryScreen(){
  const wrap = h('<div class="page" style="max-width:860px"></div>');
  const banner = h('<div class="banner"><div class="glow"></div><h1>Something happened.<br>What do you need help with?</h1><p>Stay calm. We\u2019ll coordinate the next step — hospital, insurance, family and recovery, in one place.</p></div>');
  wrap.appendChild(banner);

  const grid = h('<div class="tiles"></div>');
  const TILES = [
    ["🚨","EMERGENCY","Life-threatening right now","red","emergency"],
    ["🩹","SOMEONE IS INJURED","Non-life-threatening injury","injured"],
    ["🏥","ALREADY AT HOSPITAL","You are at the hospital now","hospital"],
    ["🔪","SURGERY / PROCEDURE","Planned or upcoming procedure","surgery"],
    ["🛡️","INSURANCE / CLAIM","Coverage, GL or documents","insurance"],
    ["🏠","DISCHARGE / GOING HOME","Leaving hospital","discharge"],
    ["🌱","RECOVERY","After discharge — physio, follow-up","recovery"],
    ["🌀","I DON'T KNOW WHAT TO DO","Let LIFEOS guide you","lost"]
  ];
  const tileMap = { emergency:0, injured:1, hospital:2, surgery:3, insurance:4, discharge:5, recovery:6, lost:7 };
  TILES.forEach((tile, idx) => {
    const [em, t, d, kind, extra] = tile;
    const b = h('<button class="tile ' + (kind==="red"?"red":"") + '"><span class="em">' + em + '</span><span>' + t + "<small>" + d + "</small></span></button>");
    b.onclick = () => triageSelect(extra || Object.keys(tileMap).find(k => tileMap[k] === idx));
    grid.appendChild(b);
  });
  wrap.appendChild(grid);

  const voice = h('<button class="btn block mt" style="padding:18px">🎙️ Talk to LIFEOS</button>');
  voice.onclick = voiceMode;
  wrap.appendChild(voice);
  wrap.appendChild(h('<p class="small muted mt" style="text-align:center">In an emergency in Malaysia, calling <b>999</b> always comes first. LIFEOS organizes everything around the response.</p>'));
  return wrap;
}
function triageSelect(kind){
  if (kind === "emergency"){ renderEmergency(); return; }
  if (kind === "lost"){
    modal("Let's take it step by step", "<p>That's okay — this is exactly what LIFEOS is for. Answer three quick things:</p>", [
      { label:"Start guided flow", cls:"primary", onClick: () => { guidedFlow(); } }
    ]);
    return;
  }
  const map = {
    injured:{ q:"Where is the injured person right now?", opts:[["At the scene of the accident","scene"],["Already on the way to hospital","transit"],["Already at hospital","hospital"]] },
    hospital:{ q:"What is happening at the hospital?", opts:[["Waiting to be assessed","hospital"],["Assessed — waiting for results","hospital"],["Admitted","hospital"],["Surgery scheduled or underway","surgery"]] },
    surgery:{ q:"Is the surgery already scheduled?", opts:[["Yes, scheduled","surgery"],["Being decided today","hospital"]] },
    insurance:{ q:"What do you need for the claim?", opts:[["Check coverage","insurance"],["Prepare claim documents","insurance"],["Request a Guarantee Letter","insurance"],["Track a claim","insurance"]] },
    discharge:{ q:"Is discharge happening today?", opts:[["Yes, today","discharge"],["In a few days","discharge"],["Just planning ahead","discharge"]] },
    recovery:{ q:"Where are you in recovery?", opts:[["Just discharged","recovery"],["Week 1","recovery"],["Week 2 or later","recovery"],["Follow-up pending","recovery"]] }
  };
  const m = map[kind] || map.injured;
  const box = h('<div><p class="mb">' + esc(m.q) + "</p><div id='topts'></div></div>");
  const opts = $("#topts", box);
  m.opts.forEach(([label, next]) => {
    const b = h('<button class="btn block" style="margin-top:8px;justify-content:flex-start"></button>'); b.textContent = label;
    b.onclick = () => { bg.remove(); runMainFlow(kind, next, label); };
    opts.appendChild(b);
  });
  const bg = modal("Tell LIFEOS", box, [{ label:"Cancel" }]);
}
function guidedFlow(){
  modal("Three quick questions", "<div>" +
    '<label class="label">1. Is anyone in immediate danger right now?</label>' +
    '<button class="btn danger block" id="gf-yes">Yes — call 999 first</button>' +
    '<button class="btn block" id="gf-no" style="margin-top:8px">No — not life-threatening</button>' +
    '<label class="label">2. Where is the patient?</label>' +
    '<button class="btn block" id="gf-hosp">Already at hospital</button>' +
    '<button class="btn block" id="gf-else" style="margin-top:8px">At home / at the scene</button>' +
    '<label class="label">3. Who is this for?</label>' +
    '<button class="btn block" id="gf-me">Myself or someone I&#39;m with</button>' +
    "</div>", [{ label:"Close" }]);
  const wire = (id, fn) => { const b = $(id, document); if (b) b.onclick = fn; };
  wire("#gf-yes", () => { document.querySelector(".modal-bg").remove(); renderEmergency(); });
  wire("#gf-no", () => { document.querySelector(".modal-bg").remove(); runMainFlow("injured","scene","Guided: not life-threatening"); });
  wire("#gf-hosp", () => { document.querySelector(".modal-bg").remove(); runMainFlow("hospital","hospital","Guided: at hospital"); });
  wire("#gf-else", () => { document.querySelector(".modal-bg").remove(); runMainFlow("injured","scene","Guided: at the scene"); });
  wire("#gf-me", () => {});
}
function runMainFlow(kind, next, label){
  const box = h('<div><p>Describe what happened, in your own words.</p><textarea class="input mt" rows="4" placeholder="e.g. My friend slipped and may have fractured his leg."></textarea><div class="notice brand mt"><span class="ic">ℹ️</span><span>LIFEOS will assess urgency from what you write. This is not a medical diagnosis.</span></div></div>');
  const ta = $("textarea", box);
  ta.value = "My friend slipped and may have fractured his leg.";
  modal("What happened?", box, [
    { label:"Cancel" },
    { label:"Assess & create case", cls:"primary", onClick: () => {
        const txt = ta.value.trim() || "Incident described by user.";
        newCase();
        S.caseState.incident.description = txt;
        S.caseState.urgency = /unconscious|bleeding|breath|chest|head inj/i.test(txt) ? "POSSIBLE EMERGENCY — call 999 if danger signs appear" : "Non-life-threatening — urgent orthopaedic assessment";
        audit("CASE_CREATED", "Case " + S.caseId + " created from triage: " + label);
        addTimeline(nowHM(), "Incident reported", txt);
        addTimeline(nowHM(), "Urgency assessed", S.caseState.urgency);
        toast("Case " + S.caseId + " created");
        S.mode = "active"; save(); render();
        showTriageResult();
      } }
  ]);
}
function showTriageResult(){
  if (!S || S.mode !== "active" || !S.caseState) return; // user reset before this fired
  const cs = S.caseState;
  const box = h("<div><p><b>Urgency assessment</b></p><div class='notice " + (/EMERGENCY/.test(cs.urgency) ? "red" : "amber") + " mt'><span class='ic'>🧭</span><span>" + esc(cs.urgency) + "</span></div>" +
    "<p class='small muted mt'>LIFEOS is not a medical service. If danger signs appear at any point — unconsciousness, heavy bleeding, breathing difficulty, severe chest pain — call 999 immediately.</p>" +
    "<div class='notice brand mt'><span class='ic'>✅</span><span>Case <b>" + esc(S.caseId) + "</b> created. The dashboard now tracks assessment, insurance, documents, family and recovery.</span></div></div>");
  modal("What happens next", box, [
    { label:"Open dashboard", cls:"primary", onClick: () => { S.tab="home"; save(); render(); } }
  ]);
}

/* ---------------- EMERGENCY MODE ---------------- */
function renderEmergency(){
  const wrap = h('<div class="page" style="max-width:760px"></div>');
  const hero = h('<div class="emergency-hero"><h2>Emergency check</h2><p>Are you or the person with you experiencing any of these right now?</p></div>');
  wrap.appendChild(hero);
  const SIGNS = ["Unconscious or unresponsive","Difficulty breathing","Bleeding heavily","Severe chest pain","Severe head or neck injury","Otherwise in immediate danger"];
  const card = h('<div class="card"></div>');
  SIGNS.forEach(sg => {
    const l = h('<label class="chkline"><input type="checkbox"><span>' + esc(sg) + "</span></label>");
    $("input", l).onchange = () => { l.classList.toggle("danger-on", $("input",l).checked); checkEmergency(); };
    card.appendChild(l);
  });
  wrap.appendChild(card);
  const ctaBox = h('<div id="ecta"></div>');
  wrap.appendChild(ctaBox);
  function checkEmergency(){
    const any = Array.from(card.querySelectorAll("input")).some(i => i.checked);
    ctaBox.innerHTML = "";
    if (any){
      const c = h('<div><button class="call-999">CALL 999<small>Malaysia MERS 999 — police · ambulance · fire</small></button><button class="btn block" id="saveme">OPEN SAVE ME 999 (app)</button><div class="notice red mt"><span class="ic">🚑</span><span>Emergency services should handle immediate medical emergencies. LIFEOS helps organize information and coordination around the response — it never replaces 999.</span></div></div>');
      $("button.call-999", c).onclick = () => { audit("ACTION_EXECUTED","Emergency: 999 call initiated"); location.href = "tel:999"; };
      $("#saveme", c).onclick = () => modal("Save ME 999","<p>SaveME 999 is the official Malaysian app for contacting MERS 999 with your location when a voice call is difficult. On a real phone, install it from your app store. (Prototype: link disabled.)</p>",[{label:"Got it",cls:"primary"}]);
      ctaBox.appendChild(c);
      audit("EMERGENCY_ESCALATION","Danger sign selected — 999 CTA shown");
    }
  }
  wrap.appendChild(h('<div class="card mt"><h3>🧾 Information that can safely help responders</h3><p class="hint">Collect only if it does not delay the call or put anyone at risk.</p>' +
    '<div class="grid2 mt"><div><label class="label">Location</label><input class="input" placeholder="e.g. Jalan Tun Mohd Fuad, TTDI"></div>' +
    '<div><label class="label">Patient name (if known)</label><input class="input" placeholder="Name"></div>' +
    '<div><label class="label">Emergency contact</label><input class="input" placeholder="Phone number"></div>' +
    '<div><label class="label">Known allergies</label><input class="input" placeholder="e.g. penicillin"></div>' +
    '<div><label class="label">Current medications</label><input class="input" placeholder="List or None"></div>' +
    '<div><label class="label">Relevant medical info</label><input class="input" placeholder="e.g. diabetic"></div></div>' +
    '<label class="label">Incident description</label><textarea class="input" rows="3" placeholder="What happened, in one or two sentences."></textarea>' +
    '<p class="small muted mt">📸 Photos or video only if it is completely safe to take them. Do not move a person with a suspected head, neck or spinal injury.</p></div>'));
  wrap.appendChild(h('<div class="notice amber"><span class="ic">⚠️</span><span>LIFEOS does not instruct medical interventions. Follow the 999 call-taker&#39;s guidance.</span></div>'));
  wrap.appendChild(h('<button class="btn ghost block mt" id="emback">← Back to start</button>'));
  $("#emback", wrap).onclick = () => render();
  $("#app").innerHTML = ""; $("#app").appendChild(h('<header class="topbar"><div class="topbar-in"><div class="logo"><div class="mark">L</div><div>LIFEOS<small>Emergency Mode</small></div></div><div class="top-tags"><span class="tag mode">EMERGENCY MODE</span><button class="btn sm ghost" id="emreset">Exit</button></div></div></header>'));
  $("#emreset").onclick = () => render();
  $("#app").appendChild(wrap);
}

/* ---------------- VOICE MODE ---------------- */
function voiceMode(){
  const box = h('<div style="text-align:center"><div class="voice-orb">🎙️</div><div class="voice-line">Listening…</div><p class="small muted">Prototype: tap to simulate a spoken sentence, or type what you would say.</p><input class="input mt" placeholder="e.g. I fell and I&#39;m at the hospital. I don&#39;t know what I should do."><div class="row mt" style="justify-content:center"></div></div>');
  const line = $(".voice-line", box), input = $("input.input", box);
  const DEMO_LINES = [
    "I fell and I'm at the hospital. I don't know what I should do.",
    "My friend slipped and may have fractured his leg.",
    "I need help with insurance and what documents to keep."
  ];
  let i = 0;
  const row = $(".row", box);
  const sim = h('<button class="btn sm primary">Simulate speech</button>');
  sim.onclick = () => { input.value = DEMO_LINES[i % DEMO_LINES.length]; line.textContent = "“" + input.value + "”"; i++; };
  const go = h('<button class="btn sm teal">Send to LIFEOS</button>');
  go.onclick = () => {
    const said = input.value.trim();
    if (!said){ toast("Say or type something first."); return; }
    bg.remove();
    if (!S.caseId) { newCase(); S.mode="active"; }
    if (S.mode !== "active"){ S.mode = "active"; }
    S.tab = "home"; save(); render();
    setTimeout(() => {
      const chat = $("#chatlog");
      if (chat){
        chat.appendChild(renderMsg(said, ["user"], null, "user"));
        const ans = aiAnswer(said);
        chat.appendChild(renderMsg(ans.text, ans.tags, ans.actions, "ai"));
        chat.scrollIntoView && sv(chat);
        audit("VOICE_INPUT","Voice-mode utterance processed (simulated)");
      }
    }, 120);
  };
  row.appendChild(sim); row.appendChild(go);
  const bg = modal("Talk to LIFEOS", box, [{ label:"Close" }]);
}

/* ================================================================
   TAB: HOME (status + AI coordinator)
   ================================================================ */
function tabHome(p){
  const cs = S.caseState;
  if (!cs){ p.appendChild(h('<div class="card empty">No case. Reset and start again.</div>')); return; }
  const STAGES = ["At hospital","Assessment","Insurance","Surgery / treatment","Discharge","Recovery"];
  const stageNames = { 1:"🟠 Hospital Assessment", 2:"🟡 Insurance Coordination", 3:"🔵 Surgery / Treatment", 4:"🟣 Discharge", 5:"🟢 Recovery" };
  const head = h('<div class="banner"><div class="glow"></div>' +
    '<p style="opacity:.8;font-size:12px;letter-spacing:.1em;font-weight:700">CASE ' + esc(S.caseId) + '</p>' +
    '<h1>' + esc(cs.patient.name) + '</h1>' +
    '<p>' + esc(stageNames[cs.stage] || cs.status) + " · " + esc(cs.hospital) + "</p></div>");
  p.appendChild(head);

  const strip = h('<div class="card"><div class="status-strip">' +
    STAGES.map((s, i) => '<span class="chip" style="' + (i < cs.stage ? "background:var(--teal-soft);color:var(--teal)" : i === cs.stage ? "background:var(--brand-soft);color:var(--brand-ink)" : "") + '">' + (i < cs.stage ? "✓ " : i === cs.stage ? "▶ " : "") + esc(s) + "</span>").join("") +
    '</div><div class="progress mt"><i style="width:' + Math.round(cs.stage/5*100) + '%"></i></div>' +
    '<p class="small muted mt">Next actions are on the Case tab. Urgent items: <b>' + S.tasks.filter(t=>t.group==="Urgent"&&!t.done).length + "</b> · Pending approvals: <b>" + S.approvals.filter(a=>a.status==="PENDING").length + "</b></p></div>");
  p.appendChild(strip);

  /* AI coordinator */
  const chat = h('<div class="card"><h3>🧠 AI Coordinator</h3><p class="hint">Ask anything about the next step. Every answer is tagged by its source.</p><div class="chat-wrap mt" id="chatlog"></div><div class="sugs mt" id="sugs"></div></div>');
  const log = $("#chatlog", chat);
  const greet = renderMsg("What do you need help with? " + cs.patient.name + "'s case is up to date — I can prepare doctor questions, insurance steps, family updates or the discharge plan.", ["guidance"], ["gotoDoctor","gotoInsurance","draftFamily","gotoRecovery"], "ai");
  log.appendChild(greet);
  const SUGS = ["Do I need to call insurance?","What should I ask the surgeon?","What documents should I keep?","Who should I inform?","Can my insurance cover this?","How do I make a claim?","What happens after surgery?","Can you explain what the doctor said?"];
  const sugs = $("#sugs", chat);
  SUGS.forEach(q => {
    const b = h("<button></button>"); b.textContent = q;
    b.onclick = () => askAI(q); sugs.appendChild(b);
  });
  const bar = h('<div class="chatbar"><input class="input" id="aiinput" placeholder="Type your question…"><button class="btn primary" id="aisend">Send</button></div>');
  const askAI = (q) => {
    const text = (q || $("#aiinput", bar).value).trim();
    if (!text) return;
    log.appendChild(renderMsg(text, ["user"], null, "user"));
    const ans = aiAnswer(text);
    S.aiTurn++;
    if (S.aiTurn % 3 === 1){ addTimeline(nowHM(), "AI coordinator consulted", text.slice(0,60), true); }
    log.appendChild(renderMsg(ans.text, ans.tags, ans.actions, "ai"));
    $("#aiinput", bar).value = "";
    sv(log.lastElementChild);
    save();
  };
  $("#aisend", bar).onclick = () => askAI();
  $("#aiinput", bar).addEventListener("keydown", (e) => { if (e.key === "Enter") askAI(); });
  p.appendChild(chat);
  p.appendChild(bar);

  const why = h('<div class="card"><h3>🔍 "Why are you telling me this?"</h3><p class="hint">Every LIFEOS answer can be traced. Sample of the knowledge layer behind this case:</p><div id="klist" class="mt"></div></div>');
  const kl = $("#klist", why);
  KNOWLEDGE.slice(0,3).forEach(k => {
    kl.appendChild(h('<div class="docrow"><div class="ic">📚</div><div style="flex:1"><b>' + esc(k.source_name) + '</b><div class="small muted">' + esc(k.note) + '</div><div class="small muted mt">jurisdiction: ' + esc(k.jurisdiction) + " · effective: " + esc(k.effective_date) + " · confidence: " + esc(k.confidence) + '</div></div><a class="btn sm" href="' + esc(k.url) + '" target="_blank" rel="noopener">Open source</a></div>'));
  });
  p.appendChild(why);
}

/* ================================================================
   TAB: CASE (dashboard)
   ================================================================ */
function tabCase(p){
  const cs = S.caseState;
  if (!cs){ p.appendChild(h('<div class="card empty">No case.</div>')); return; }
  const two = h('<div class="grid2"></div>');

  /* incident summary */
  const sum = h('<div class="card"><h3>📋 Incident Summary <span class="pill amber">AI-GENERATED SUMMARY</span></h3>' +
    '<p>' + esc(cs.patient.name) + " " + esc(cs.incident.description) + " He/She is conscious and currently at " + esc(cs.hospital) + ", awaiting orthopaedic assessment. Urgency (AI triage): <b>" + esc(cs.urgency) + '</b>.</p>' +
    '<p class="small muted mt">Generated from user input and case state. Verify details with the treating team.</p></div>');
  p.appendChild(sum);

  /* details */
  const det = h('<div class="card"><h3>🧾 Case details</h3><dl class="kv">' +
    "<dt>Patient</dt><dd>" + esc(cs.patient.name) + " (" + esc(cs.patient.relation) + ")</dd>" +
    "<dt>Incident</dt><dd>" + esc(cs.incident.type) + " — " + esc(cs.incident.date) + " " + esc(cs.incident.time) + "</dd>" +
    "<dt>Location</dt><dd>" + esc(cs.incident.location) + "</dd>" +
    "<dt>Reported by</dt><dd>" + esc(cs.incident.reported_by) + "</dd>" +
    "<dt>Hospital</dt><dd>" + esc(cs.hospital) + "</dd>" +
    "<dt>Doctor</dt><dd>" + esc(cs.doctor) + "</dd>" +
    "<dt>Diagnosis</dt><dd>" + esc(cs.diagnosis) + ' <span class="pill ' + (cs.diagnosis_verified ? "teal" : "amber") + '">' + (cs.diagnosis_verified ? "VERIFIED" : "UNVERIFIED — pending clinician") + "</span></dd>" +
    "<dt>Admission</dt><dd>" + (cs.admitted ? "Admitted" : "Not admitted") + " · " + esc(cs.admission_no) + "</dd>" +
    "</dl>" +
    '<div class="row mt"><button class="btn sm" id="editHosp">Update hospital / doctor</button><button class="btn sm" id="verDiag">Mark diagnosis confirmed</button></div></div>');
  p.appendChild(det);
  $("#editHosp", det).onclick = () => {
    const box = h('<div><label class="label">Hospital</label><input class="input" id="ih" value="' + esc(cs.hospital) + '"><label class="label">Doctor / team</label><input class="input" id="idoc" value="' + esc(cs.doctor) + '"></div>');
    modal("Update hospital & doctor", box, [{ label:"Save", cls:"primary", onClick: () => {
      cs.hospital = $("#ih", box).value || cs.hospital; cs.doctor = $("#idoc", box).value || cs.doctor;
      addTimeline(nowHM(), "Hospital details updated", cs.hospital + " · " + cs.doctor, true);
      toast("Case details updated"); render();
    }}]);
  };
  $("#verDiag", det).onclick = () => {
    modal("Confirm diagnosis", "<p>Has a treating clinician confirmed the diagnosis? LIFEOS will mark it <b>VERIFIED</b> and record who confirmed it. (Prototype records your confirmation.)</p>", [
      { label:"Cancel" },
      { label:"Confirm as verified", cls:"primary", onClick: () => {
          cs.diagnosis = "Confirmed: fracture of the right leg (demo)"; cs.diagnosis_verified = true;
          const ut = S.tasks.find(t => t.title === "Confirm doctor assessment"); if (ut) ut.done = true;
          addTimeline(nowHM(), "Diagnosis confirmed by clinician", "Marked verified in case state");
          if (cs.stage < 2){ cs.stage = 2; toast("Stage updated: Insurance Coordination"); }
          save(); render();
        } }]);
  };

  /* timeline */
  p.appendChild(h('<div class="sectiontitle">TIMELINE</div>'));
  const tl = h('<div class="card"><ul class="timeline"></ul><button class="btn sm ghost" id="addTl">+ Add timeline entry</button></div>');
  const ul = $(".timeline", tl);
  S.timeline.forEach(ev => {
    ul.appendChild(h("<li" + (ev.minor ? ' class="minor"' : "") + "><time>" + esc(ev.t) + "</time><div class='tl-t'>" + esc(ev.title) + "</div>" + (ev.detail ? "<div class='tl-d'>" + esc(ev.detail) + "</div>" : "") + "</li>"));
  });
  p.appendChild(tl);
  $("#addTl", tl).onclick = () => {
    const box = h('<div><label class="label">What happened?</label><input class="input" id="tlt" placeholder="e.g. X-ray completed"></div>');
    modal("Add timeline entry", box, [{ label:"Add", cls:"primary", onClick: () => {
      const t = $("#tlt", box).value.trim(); if (!t) return;
      addTimeline(nowHM(), t, "Added manually");
      toast("Timeline updated"); render();
    }}]);
  };

  /* tasks */
  p.appendChild(h('<div class="sectiontitle">NEXT ACTIONS</div>'));
  p.appendChild(tasksBoard("mod-tasks"));

  /* surgery / status actions */
  p.appendChild(h('<div class="sectiontitle">STATUS UPDATES</div>'));
  const st = h('<div class="card"><div class="row">' +
    '<button class="btn sm" id="btnSurg">🔪 Surgery scheduled</button>' +
    '<button class="btn sm" id="btnReady">🏥 Ready for discharge</button>' +
    '<button class="btn sm" id="btnClose">✅ Close case (follow-up done)</button></div>' +
    '<p class="hint mt">These simulate status changes arriving from the hospital journey.</p></div>');
  p.appendChild(st);
  wireStatusButtons(st);
}

function tasksBoard(idPrefix){
  const wrap = h('<div class="card" id="' + idPrefix + '"><h3>✅ Task engine</h3><p class="hint">Every task has an owner, deadline and permission requirement. AI can propose; only people complete.</p></div>');
  const groups = ["Urgent","Insurance","Documents","Family","Discharge"];
  groups.forEach(g => {
    const items = S.tasks.filter(t => t.group === g);
    if (!items.length) return;
    const gEl = h('<div class="taskgroup"><div class="tg-h"><span>' + esc(g.toUpperCase()) + '</span><span>' + items.filter(t=>t.done).length + "/" + items.length + "</span></div></div>");
    items.forEach(t => {
      const row = h('<label class="task' + (t.done ? " done" : "") + '"><input type="checkbox"' + (t.done?" checked":"") + '><div class="t-body"><div class="t-title">' + esc(t.title) + '</div><div class="t-meta">' +
        '<span class="pill grey">👤 ' + esc(t.owner) + "</span><span class='pill grey'>⏱ " + esc(t.deadline) + "</span>" +
        (t.perm !== "none" ? "<span class='pill violet'>🔑 permission: " + esc(t.perm) + "</span>" : "") +
        "<span class='pill grey'>source: " + esc(t.source) + "</span></div></div></label>");
      $("input", row).onchange = () => {
        t.done = $("input", row).checked; t.status = t.done ? "done" : "open";
        if (t.done){ addTimeline(nowHM(), "Task completed", t.title, true); }
        save(); render();
      };
      gEl.appendChild(row);
    });
    wrap.appendChild(gEl);
  });
  return wrap;
}
function wireStatusButtons(st){
  $("#btnSurg", st).onclick = () => {
    const box = h('<div><label class="label">Procedure</label><input class="input" id="sp" value="ORIF — right leg (demo)"><label class="label">Scheduled time</label><input class="input" id="st" value="Tomorrow 08:30"></div>');
    modal("Surgery scheduled", box, [{ label:"Save to case", cls:"primary", onClick: () => {
      const cs = S.caseState;
      cs.surgery_scheduled = true; cs.surgery_time = $("#st", box).value; cs.procedure = $("#sp", box).value;
      cs.stage = Math.max(cs.stage, 3);
      addTimeline(nowHM(), "Surgery scheduled", cs.procedure + " · " + cs.surgery_time);
      S.tasks.push({ id:uid("T"), group:"Urgent", title:"Confirm fasting & anaesthesia instructions", owner:"Patient", status:"open", deadline: cs.surgery_time, source:"Scheduling", perm:"none", done:false });
      S.tasks.push({ id:uid("T"), group:"Insurance", title:"Confirm GL issued before surgery", owner:"Arthur (friend)", status:"open", deadline:"Before surgery", source:"Insurance module", perm:"insurance", done:false });
      notify("Surgery has been scheduled.", "surg");
      save(); render();
    }}]);
  };
  $("#btnReady", st).onclick = () => {
    const cs = S.caseState; cs.discharge_ready = true; cs.stage = Math.max(cs.stage, 4);
    addTimeline(nowHM(), "Ready for discharge", "Discharge checklist generated");
    save(); render(); dischargeModal();
  };
  $("#btnClose", st).onclick = () => {
    modal("Close the case?", "<p>The case closes when the follow-up is completed. Closing archives tasks and stops notifications. You can reopen by resetting the demo.</p>", [
      { label:"Cancel" }, { label:"Close case", cls:"primary", onClick: () => {
        addTimeline(nowHM(), "Case closed", "Follow-up completed");
        audit("CASE_CLOSED","Case " + S.caseId + " closed");
        toast("Case " + S.caseId + " closed. Get well soon, " + S.caseState.patient.name.split(" ")[0] + ".");
        S.caseState.stage = 5; save(); render();
      }}]);
  };
}

/* ================================================================
   DISCHARGE
   ================================================================ */
function dischargeModal(){
  const items = ["Discharge summary","Medication list","Follow-up appointment","Medical certificate","Medical report","Imaging/report","Itemised bill","Receipts","Insurance documents","Transport home","Mobility equipment","Caregiver arrangements","Physiotherapy plan"];
  const box = h("<div><p>Check off what you already have. LIFEOS will turn the rest into tasks.</p><div id='dl'></div></div>");
  const dl = $("#dl", box);
  items.forEach(it => {
    const have = S.documents.some(d => d.name.toLowerCase().includes(it.toLowerCase().split(" ")[0])) || S.tasks.some(t => t.title === it && t.done);
    const l = h('<label class="chkline"><input type="checkbox"' + (have?" checked":"") + "><span>" + esc(it) + "</span></label>");
    dl.appendChild(l);
  });
  modal("DISCHARGE CHECKLIST", box, [
    { label:"Organize remaining tasks", cls:"primary", onClick: () => {
        let added = 0;
        Array.from(dl.children).forEach(l => {
          if (!$("input", l).checked){
            const t = $("span", l).textContent;
            if (!S.tasks.some(x => x.title === t)){
              S.tasks.push({ id:uid("T"), group:"Discharge", title:t, owner:"Patient / family", status:"open", deadline:"Discharge day", source:"Discharge checklist", perm:"none", done:false });
              added++;
            }
          }
        });
        const rt = S.tasks.find(x => x.title === "Physiotherapy plan"); if (rt) rt.done = true;
        if (!S.caseState.recovery){ S.caseState.recovery = { started:true, day1:"Post-op instructions received", week1:"Follow-up appointment", week2:"Physiotherapy begins", week6:"Strength & mobility review", followup:"Orthopaedic review — date TBC" }; }
        addTimeline(nowHM(), "Discharge checklist created", added + " outstanding tasks assigned");
        notify("Discharge preparation required.", "disch");
        save(); render();
        toast(added + " discharge tasks created");
      } },
    { label:"Close" }
  ]);
}

/* ================================================================
   TAB: ACTIONS (approval center)
   ================================================================ */
function tabActions(p){
  p.appendChild(h('<div class="sectiontitle">ACTION CENTER — REVIEW → APPROVE → EXECUTE</div>'));
  p.appendChild(h('<div class="notice brand mb"><span class="ic">🛡️</span><span>Every AI action states what it will do, why, which data will be shared, and who authorized it. Nothing external happens without a human tapping approve.</span></div>'));

  const pre = h('<div class="card"><h3>⚡ Prepare a new action</h3><div class="row mt">' +
    '<button class="btn sm" id="pfam">Draft family update</button>' +
    '<button class="btn sm" id="pins">Draft insurer request</button>' +
    '<button class="btn sm" id="pemp">Draft employer notice</button>' +
    '<button class="btn sm" id="pnot">Prepare “I CAN’T TALK” pack</button></div></div>');
  p.appendChild(pre);
  $("#pfam", pre).onclick = () => templateModal("family");
  $("#pins", pre).onclick = () => templateModal("insurer");
  $("#pemp", pre).onclick = () => templateModal("employer");
  $("#pnot", pre).onclick = cantTalkFlow;

  if (!S.approvals.length){ p.appendChild(h('<div class="card empty">No actions yet. Draft one above, or ask the AI Coordinator to prepare one.</div>')); }
  S.approvals.forEach(a => p.appendChild(approvalCard(a)));
  p.appendChild(h('<div class="sectiontitle">MODULAR AGENTS</div>'));
  const ag = h('<div class="grid3"></div>');
  [["🚑","Emergency Agent","Monitors danger signs and escalates to 999. Never replaces emergency services."],
   ["🏥","Hospital Agent","Tracks admission, doctors, procedures, appointments and discharge."],
   ["🛡️","Insurance Agent","Coverage questions, GL requests, claim documents, claim status."],
   ["👨‍👩‍👧","Family Agent","Prepares family communications within each member's permissions."],
   ["🚐","Transport Agent","Ambulance, wheelchair transport, ride-hailing, non-emergency transfers."],
   ["🌱","Recovery Agent","Physiotherapy, follow-ups, medication reminders, home care, equipment."],
   ["📄","Document Agent","Extracts and organizes documents; originals stay immutable."],
   ["✍️","Communication Agent","Drafts family, employer and insurer messages for human approval."],
   ["🧭","Rules Engine","Enforces emergency rules, permission rules and claim rules on every action."]
  ].forEach(([ic, n, d]) => ag.appendChild(h('<div class="dircard"><b>' + ic + " " + esc(n) + '</b><div class="small muted mt">' + esc(d) + "</div></div>")));
  p.appendChild(ag);
}
function approvalCard(a){
  const stCls = a.status === "PENDING" ? "amber" : a.status === "APPROVED" ? "brand" : a.status === "EXECUTED" ? "teal" : "grey";
  const c = h('<div class="appr"><div class="spread"><b>' + esc(a.title) + '</b><span class="pill ' + stCls + '">' + esc(a.status) + "</span></div>" +
    '<div class="reason"><b>Why:</b> ' + esc(a.reason) + "</div>" +
    '<div class="data"><b>Target:</b> ' + esc(a.target) + "\n<b>Data to be shared:</b>\n" + esc(a.data) + "</div>" +
    '<div class="small muted"><b>Authorization:</b> ' + (a.status === "PENDING" ? "awaiting approval" : "approved by patient / authorized reporter") + " · <b>Audit:</b> " + esc(a.log.join(" → ")) + "</div>" +
    '<div class="row mt"></div></div>');
  const row = $(".row", c);
  if (a.status === "PENDING"){
    const be = h('<button class="btn sm">Edit</button>');
    be.onclick = () => {
      const box = h("<div><textarea class='input' rows='6'>" + esc(a.data) + "</textarea></div>");
      modal("Edit action", box, [{ label:"Save", cls:"primary", onClick: () => { a.data = $("textarea", box).value; a.log.push("Edited by human (" + nowHM() + ")"); save(); render(); } }]);
    };
    const ba = h('<button class="btn sm primary">Approve & execute</button>');
    ba.onclick = () => {
      a.status = "APPROVED"; a.log.push("Approved by patient (" + nowHM() + ")");
      audit("ACTION_APPROVED", a.title);
      setTimeout(() => {
        if (!S || !S.approvals || !S.approvals.includes(a)) return; // state was reset
        a.status = "EXECUTED"; a.log.push("Executed (" + nowHM() + ")");
        audit("ACTION_EXECUTED", a.title);
        audit("MESSAGE_SENT", a.title);
        save(); render();
      }, 900);
      toast("Approved — executing in prototype…");
      save(); render();
    };
    const bc = h('<button class="btn sm">Cancel</button>');
    bc.onclick = () => { a.status = "CANCELLED"; a.log.push("Cancelled by human (" + nowHM() + ")"); save(); render(); };
    row.appendChild(be); row.appendChild(ba); row.appendChild(bc);
  } else if (a.status === "APPROVED"){
    row.appendChild(h('<span class="small muted">Executing…</span>'));
  } else if (a.status === "EXECUTED"){
    row.appendChild(h('<span class="pill teal">RESULT: completed — logged to audit trail</span>'));
  } else {
    row.appendChild(h('<span class="small muted">No longer pending.</span>'));
  }
  return c;
}
function cantTalkFlow(){
  const box = h('<div><p>Who is the authorized emergency contact LIFEOS should prepare everything for?</p>' +
    '<label class="label">Emergency contact</label><select class="input" id="ctsel"></select>' +
    '<p class="small muted mt">LIFEOS will prepare: family notification, insurer notification draft, employer notice, doctor question list and a consolidated task list. <b>Nothing is sent automatically.</b></p></div>');
  const sel = $("#ctsel", box);
  S.family.filter(f => f.perms.RECEIVE_ALERTS).forEach(f => { const o = h("<option>" + esc(f.name) + " — " + esc(f.role) + "</option>"); sel.appendChild(o); });
  if (!sel.children.length) sel.appendChild(h("<option>No authorized contacts — add someone in Family first</option>"));
  modal("I CAN'T TALK — HANDLE THIS", box, [
    { label:"Cancel" },
    { label:"Prepare the pack", cls:"primary", onClick: () => {
        createApproval("family", "Family notification (I-can't-talk pack)", "User activated I-CAN'T-TALK mode; authorized contact selected.", "Patient name: Daniel Tan\nStatus: admitted at Demo Hospital, being assessed\nHospital: Demo Hospital Klang Valley", "PENDING");
        createApproval("insurer", "Insurer notification draft", "Early notification reduces GL delays. Requires confirmation of policy details.", "Policy: DEMO-88-445512\nHospital: Demo Hospital Klang Valley\nIncident: fall, suspected leg fracture\nRequest: coverage confirmation + GL process", "PENDING");
        createApproval("employer", "Employer notification draft", "Sick-leave notice pending medical certificate.", "Employee note: receiving medical treatment; MC and recovery period to follow once confirmed.", "PENDING");
        addTimeline(nowHM(), "I-CAN'T-TALK pack prepared", "3 drafts awaiting approval");
        notify("I-can't-talk pack is ready for review.", "ict");
        S.tab = "actions"; save(); render();
        toast("3 drafts prepared — review in Action Center");
      } }
  ]);
}

/* ================================================================
   TAB: DOCUMENTS
   ================================================================ */
function tabDocuments(p){
  const head = h('<div class="card"><h3>📁 Document Vault</h3><p class="hint">Uploads are simulated in this prototype. Originals stay immutable; the Document Agent only extracts fields.</p></div>');
  p.appendChild(head);
  const dz = h('<div class="dropzone" id="dz"><b>Drop or choose a file</b><br>PDF · JPG · PNG · DOC<br><span class="small">(prototype: picking a file creates a simulated upload + OCR)</span><div class="mt"><button class="btn sm primary" id="pick">Choose file</button><button class="btn sm" id="sam">Add sample OCR result</button></div></div>');
  p.appendChild(dz);
  const inp = h('<input type="file" style="display:none" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx">');
  dz.appendChild(inp);
  $("#pick", dz).onclick = () => inp.click();
  $("#sam", dz).onclick = () => simulateUpload("sample-medical-report.pdf","Medical");
  inp.onchange = () => { const f = inp.files[0]; if (f) simulateUpload(f.name, guessType(f.name)); };

  const cats = ["Identity","Insurance","Medical","X-ray","Prescription","Hospital bill","Receipt","Police report","Employer","Discharge","Physiotherapy"];
  p.appendChild(h('<div class="sectiontitle">DOCUMENTS BY CATEGORY</div>'));
  let any = false;
  cats.forEach(cat => {
    const docs = S.documents.filter(d => d.type === cat);
    if (!docs.length) return;
    any = true;
    const card = h('<div class="card"><h3>' + esc(cat) + ' <span class="pill grey">' + docs.length + "</span></h3></div>");
    docs.forEach(d => {
      const row = h('<div class="docrow"><div class="ic">' + (d.mime === "pdf" ? "📄" : d.mime === "image" ? "🖼️" : "📝") + '</div><div style="flex:1"><b>' + esc(d.name) + '</b><div class="small muted">' + esc(d.date) + " · OCR: " + esc(ocrSummary(d.ocr)) + '</div></div><button class="btn sm">View</button></div>');
      $("button", row).onclick = () => docModal(d);
      card.appendChild(row);
    });
    p.appendChild(card);
  });
  if (!any) p.appendChild(h('<div class="card empty">No documents yet. Add the admission record as soon as you receive it.</div>'));

  const rd = readiness();
  p.appendChild(h('<div class="sectiontitle">CLAIM DOCUMENT COMPLETENESS</div>'));
  p.appendChild(h('<div class="card"><div class="progress"><i style="width:' + rd.pct + '%"></i></div><p class="small muted mt">' + rd.haveTypes.length + " of " + requiredDocs().length + " insurer-required document types present. Missing: " + (rd.missing.length ? esc(rd.missing.join(", ")) : "none") + ". Requirements vary by insurer — confirm with your insurer.</p></div>"));
}
function guessType(name){
  const s = name.toLowerCase();
  if (/x-?ray|imaging/.test(s)) return "X-ray";
  if (/bill|invoice/.test(s)) return "Hospital bill";
  if (/receipt|resit/.test(s)) return "Receipt";
  if (/police|report polis/.test(s)) return "Police report";
  if (/insur|policy/.test(s)) return "Insurance";
  if (/mc|cert/.test(s)) return "Employer";
  if (/discharge/.test(s)) return "Discharge";
  return "Medical";
}
function ocrSummary(o){
  if (!o) return "pending";
  const parts = [];
  if (o.document_type && o.document_type !== "—") parts.push(o.document_type);
  if (o.date) parts.push("");
  if (o.hospital && o.hospital !== "—") parts.push(o.hospital);
  if (o.amount && o.amount !== "—") parts.push(o.amount);
  if (o.policy && o.policy !== "—") parts.push("policy " + o.policy);
  return parts.filter(Boolean).join(" · ") || "fields extracted";
}
function docModal(d){
  const o = d.ocr || {};
  const box = h('<div><dl class="kv">' +
    "<dt>Document type</dt><dd>" + esc(o.document_type || "—") + "</dd>" +
    "<dt>Date</dt><dd>" + esc(d.date) + "</dd>" +
    "<dt>Patient</dt><dd>" + esc(o.patient || "—") + "</dd>" +
    "<dt>Hospital</dt><dd>" + esc(o.hospital || "—") + "</dd>" +
    "<dt>Doctor</dt><dd>" + esc(o.doctor || "—") + "</dd>" +
    "<dt>Amount</dt><dd>" + esc(o.amount || "—") + "</dd>" +
    "<dt>Policy</dt><dd>" + esc(o.policy || "—") + "</dd>" +
    "<dt>Claim ref</dt><dd>" + esc(o.claim_reference || "—") + "</dd></dl>" +
    '<div class="notice brand mt"><span class="ic">🔒</span><span>Original file is stored immutable. Extraction is read-only; nothing edits the source document.</span></div></div>');
  modal(d.name, box, [
    { label:"Delete document", cls:"danger", onClick: () => {
        S.documents = S.documents.filter(x => x.id !== d.id);
        audit("DOCUMENT_DELETED", d.name);
        save(); render(); toast("Deleted (demo).");
      } },
    { label:"Close", cls:"primary" }
  ]);
  audit("DOCUMENT_VIEWED", d.name);
}
function simulateUpload(name, type){
  const OCRS = {
    "Medical": { document_type:"Hospital admission record", patient:"Daniel Tan", hospital:"Demo Hospital Klang Valley", doctor:"Dr. Lim (A&E)", amount:"—", policy:"—", claim_reference:"—" },
    "X-ray": { document_type:"X-ray report", patient:"Daniel Tan", hospital:"Demo Hospital Klang Valley", doctor:"Radiology", amount:"—", policy:"—", claim_reference:"—" },
    "Hospital bill": { document_type:"Itemised bill", patient:"Daniel Tan", hospital:"Demo Hospital Klang Valley", doctor:"—", amount:"RM 4,280.00 (provisional)", policy:"—", claim_reference:"—" },
    "Receipt": { document_type:"Payment receipt", patient:"Daniel Tan", hospital:"Demo Hospital Klang Valley", doctor:"—", amount:"RM 500.00", policy:"—", claim_reference:"—" },
    "Police report": { document_type:"Police report", patient:"Daniel Tan", hospital:"—", doctor:"—", amount:"—", policy:"—", claim_reference:"—", date:"—" },
    "Insurance": { document_type:"Policy document", patient:"Daniel Tan", hospital:"—", doctor:"—", amount:"—", policy:"DEMO-88-445512", claim_reference:"—" },
    "Employer": { document_type:"Medical certificate", patient:"Daniel Tan", hospital:"Demo Hospital Klang Valley", doctor:"Dr. Lim", amount:"—", policy:"—", claim_reference:"—" },
    "Discharge": { document_type:"Discharge summary", patient:"Daniel Tan", hospital:"Demo Hospital Klang Valley", doctor:"Dr. Lim", amount:"—", policy:"—", claim_reference:"—" }
  };
  const d = { id:uid("D"), name:name, type:type, mime:/\.(jpg|jpeg|png)$/i.test(name) ? "image" : /\.pdf$/i.test(name) ? "pdf" : "doc", date:todayISO(), ocr: OCRS[type] || { document_type:type, patient:"Daniel Tan" } };
  S.documents.unshift(d);
  const reqTypeMap = { "Identity":"Identity document", "Medical":"Hospital admission record", "X-ray":"X-ray / imaging report", "Hospital bill":"Itemised bill", "Receipt":"Original receipts", "Police report":"Police report" };
  const t = S.tasks.find(x => x.group === "Documents" && x.title === (reqTypeMap[type] || x.title) && !x.done);
  if (t){ t.done = true; addTimeline(nowHM(), "Document uploaded", d.name + " → " + t.title + " complete", true); }
  audit("DOCUMENT_UPLOADED", d.name);
  save(); render();
  toast("Uploaded & OCR complete: " + name);
}

/* ================================================================
   TAB: FAMILY
   ================================================================ */
const PERM_DEFS = [
  ["VIEW_STATUS","See case status"],["VIEW_MEDICAL","See medical details"],["VIEW_FINANCIAL","See costs & claims"],
  ["VIEW_DOCUMENTS","Open documents"],["RECEIVE_ALERTS","Get notifications"],["ACT_ON_BEHALF","Act for the patient"]
];
function tabFamily(p){
  p.appendChild(h('<div class="notice brand mb"><span class="ic">🔐</span><span>Every permission is explicit and least-privilege by default. Notifications never reveal sensitive details to unauthorized members.</span></div>'));
  p.appendChild(h('<div class="sectiontitle">FAMILY CIRCLE</div>'));
  S.family.forEach(f => {
    const c = h('<div class="card"><div class="spread"><b>' + esc(f.name) + ' <span class="pill brand">' + esc(f.role) + '</span></b><span class="small muted">' + esc(f.relation) + " · " + esc(f.phone) + "</span></div><div class='mt' id='perm-" + f.id + "'></div></div>");
    const pw = $("#perm-" + f.id, c);
    PERM_DEFS.forEach(([k, lbl]) => {
      const chip = h('<span class="permchip' + (f.perms[k] ? " on" : "") + '">' + (f.perms[k] ? "✓ " : "") + esc(k) + "</span>");
      chip.title = lbl;
      chip.onclick = () => { f.perms[k] = !f.perms[k]; audit(f.perms[k] ? "PERMISSION_GRANTED" : "PERMISSION_REVOKED", k + " → " + f.name); save(); render(); };
      pw.appendChild(chip);
    });
    p.appendChild(c);
  });
  const add = h('<button class="btn block mt">+ Add family member / contact</button>');
  add.onclick = () => {
    const box = h('<div><label class="label">Name</label><input class="input" id="fn"><label class="label">Role</label><select class="input" id="fr"><option>Primary Contact</option><option>Secondary Contact</option><option>Doctor</option><option>Insurance Agent</option><option>Employer</option><option>Caregiver</option></select><label class="label">Phone</label><input class="input" id="fp" placeholder="+60 …"></div>');
    modal("Add contact", box, [{ label:"Add", cls:"primary", onClick: () => {
      const n = $("#fn", box).value.trim(); if (!n) return;
      S.family.push({ id:uid("F"), name:n, role:$("#fr", box).value, relation:"—", phone:$("#fp", box).value || "—", perms:{ VIEW_STATUS:true, VIEW_MEDICAL:false, VIEW_FINANCIAL:false, VIEW_DOCUMENTS:false, RECEIVE_ALERTS:true, ACT_ON_BEHALF:false } });
      audit("CONTACT_ADDED", n); save(); render();
    }}]);
  };
  p.appendChild(add);
  p.appendChild(h('<div class="sectiontitle">NOTIFICATION PREVIEW</div>'));
  const np = h('<div class="card"><p class="hint">What each member would receive right now (least-privilege in action):</p><div id="npv" class="mt"></div></div>');
  const v = $("#npv", np);
  S.family.forEach(f => {
    let msg;
    if (f.perms.VIEW_MEDICAL) msg = "Daniel has arrived at hospital and is being assessed for a suspected leg fracture. Surgery may be discussed today.";
    else if (f.perms.VIEW_STATUS) msg = "Daniel has arrived at hospital. Status: being assessed. LIFEOS will update you.";
    else msg = "You are listed as a contact for Daniel. No details are shared with your current permissions.";
    v.appendChild(h('<div class="docrow"><div class="ic">🔔</div><div style="flex:1"><b>' + esc(f.name) + '</b> <span class="pill grey">' + esc(f.role) + '</span><div class="small mt">' + esc(msg) + "</div></div></div>"));
  });
  p.appendChild(np);
}

/* ================================================================
   INSURANCE MODULE (used in case tab via modal + main card)
   ================================================================ */
function requestGLFlow(){
  const cs = S.caseState;
  createApproval("insurer", "Guarantee Letter request", "Admission confirmed; GL avoids upfront payment for covered treatment. Insurer confirms eligibility.", "Policy: " + cs.insurance.policy_number + "\nPatient: Daniel Tan\nHospital: " + cs.hospital + "\nProcedure: " + (cs.procedure || "pending confirmation") + "\nRequest: Guarantee Letter for admission", "PENDING");
  cs.insurance.gl_status = "Requested — awaiting insurer";
  const t = S.tasks.find(x => x.title.startsWith("Request Guarantee")); if (t){ t.status = "open"; }
  addTimeline(nowHM(), "GL requested from insurer", "Draft in Action Center for approval");
  S.tab = "actions"; save(); render();
  toast("GL request drafted — approve in Action Center");
}

/* ================================================================
   TAB: RECOVERY
   ================================================================ */
function tabRecovery(p){
  const cs = S.caseState;
  if (!cs.recovery){
    p.appendChild(h('<div class="card"><h3>🌱 Recovery plan starts at discharge</h3><p class="hint">LIFEOS tracks appointments, medication pickups, documents, physiotherapy, claims and caregiver tasks. Medical treatment decisions always belong to the treating clinicians.</p>' +
      '<button class="btn primary mt" id="seed">Generate recovery timeline (demo)</button></div>'));
    $("#seed", p).onclick = () => {
      cs.recovery = { started:true, day1:"Post-op instructions · medication list · wound care", day3:"First dressing check · short walks at home", week1:"Follow-up appointment · wound review", week2:"Physiotherapy begins · progress photos for claim", followup:"Orthopaedic review at 6 weeks" };
      cs.stage = Math.max(cs.stage, 5);
      addTimeline(nowHM(), "Recovery plan created","Timeline: Day 1 → Week 6 follow-up");
      S.tasks.push({ id:uid("T"), group:"Discharge", title:"Book physiotherapy (Week 1)", owner:"Patient / family", status:"open", deadline:"Week 1", source:"Recovery Agent", perm:"none", done:false });
      notify("Follow-up appointment is tomorrow.", "rec");
      save(); render();
    };
    return;
  }
  const r = cs.recovery;
  p.appendChild(h('<div class="sectiontitle">RECOVERY TIMELINE</div>'));
  const nodes = h('<div class="reco"></div>');
  [["DAY 1","Instructions",1],["DAY 3","Dressing check",2],["WEEK 1","Follow-up",3],["WEEK 2","Physio",4],["FOLLOW-UP","6-week review",5]].forEach(([d, t, st]) => {
    nodes.appendChild(h('<div class="rnode ' + (cs.stage > st ? "past" : cs.stage === st ? "now" : "") + '"><div class="rd">' + d + '</div><div class="rt">' + esc(t) + "</div></div>"));
  });
  p.appendChild(nodes);
  p.appendChild(h('<div class="card"><h3>🧭 Recovery guidance</h3><p>Follow your treating clinician&#39;s instructions. LIFEOS tracks the coordination around recovery, never the medical decisions.</p>' +
    '<dl class="kv mt"><dt>Day 1</dt><dd>' + esc(r.day1) + "</dd><dt>Day 3</dt><dd>" + esc(r.day3 || "—") + "</dd><dt>Week 1</dt><dd>" + esc(r.week1 || "—") + "</dd><dt>Week 2</dt><dd>" + esc(r.week2 || "—") + "</dd><dt>Follow-up</dt><dd>" + esc(r.followup || "—") + "</dd></dl></div>"));
  p.appendChild(h('<div class="sectiontitle">RECOVERY TRACKING</div>'));
  const groups = ["Appointments","Medications","Documents","Physiotherapy","Claims & payments","Caregiver"];
  const tk = h('<div class="card" id="rec-tasks"></div>');
  let shown = 0;
  S.tasks.filter(t => ["Discharge","Documents","Insurance"].includes(t.group)).forEach(t => {
    shown++;
    const row = h('<label class="task' + (t.done?" done":"") + '"><input type="checkbox"' + (t.done?" checked":"") + "><div class='t-body'><div class='t-title'>" + esc(t.title) + "</div><div class='t-meta'><span class='pill grey'>⏱ " + esc(t.deadline) + "</span></div></div></label>");
    $("input", row).onchange = () => { t.done = $("input",row).checked; save(); render(); };
    tk.appendChild(row);
  });
  if (!shown) tk.appendChild(h('<div class="empty">Nothing to track yet.</div>'));
  p.appendChild(tk);
}

/* ================================================================
   TAB: DIRECTORY
   ================================================================ */
function tabDirectory(p){
  p.appendChild(h('<div class="notice amber mb"><span class="ic">🗂️</span><span>' + esc(DIR_STAMP) + " This is an admin-managed directory — sample entries marked “sample” are synthetic.</span></div>"));
  p.appendChild(h('<div class="sectiontitle">MALAYSIA DIRECTORY (ADMIN-MANAGED)</div>'));
  const grid = h('<div class="dirgrid"></div>');
  DIRECTORY.forEach(d => {
    grid.appendChild(h('<div class="dircard"><div class="d-name">' + esc(d.name) + '</div><div class="small muted">' + esc(d.cat) + '</div><div class="d-meta mt"><b>Contact:</b> ' + esc(d.contact) + '</div><div class="d-meta">' + esc(d.verified) + "</div></div>"));
  });
  p.appendChild(grid);
  p.appendChild(h('<div class="card mt"><h3>📍 Location</h3><p class="hint">LIFEOS uses device location only with explicit permission, and never exposes precise location to unauthorized parties. (Prototype: location access not requested.)</p><button class="btn sm mt" id="locbtn">Simulate location permission prompt</button></div>'));
  $("#locbtn", p).onclick = () => modal("Location permission", "<p>In production, LIFEOS would request browser location <b>only</b> to pre-fill the 999 call sheet and find nearby panel hospitals. You would see a standard browser permission prompt, revocable at any time. Nothing is shared with family or insurers without explicit action.</p>", [{label:"Understood", cls:"primary"}]);
}

/* ================================================================
   TAB: AUDIT
   ================================================================ */
function tabAudit(p){
  const stats = h('<div class="grid3 mb"></div>');
  [["Cases","1"],["Audit events",String(S.audit.length)],["Documents",String(S.documents.length)],["Approvals",String(S.approvals.length)],["Tasks done",S.tasks.filter(t=>t.done).length + "/" + S.tasks.length],["Permissions",String(S.family.reduce((n,f)=>n+Object.values(f.perms).filter(Boolean).length,0))]]
    .forEach(([k,v]) => stats.appendChild(h('<div class="card" style="text-align:center"><div class="bigcount">' + esc(v) + '</div><div class="small muted">' + esc(k) + "</div></div>")));
  p.appendChild(stats);
  p.appendChild(h('<div class="sectiontitle">AUDIT TRAIL</div>'));
  const t = h('<div class="card" style="overflow-x:auto"><table class="tbl auditrow"><thead><tr><th>When</th><th>Event</th><th>Detail</th></tr></thead><tbody></tbody></table></div>');
  const tb = $("tbody", t);
  S.audit.forEach(a => {
    tb.appendChild(h("<tr><td>" + esc(a.at.replace("T"," ").slice(0,19)) + "</td><td><span class='pill brand'>" + esc(a.event) + "</span></td><td>" + esc(a.detail) + "</td></tr>"));
  });
  p.appendChild(t);
  p.appendChild(h('<div class="card mt"><h3>🔒 Privacy & security posture</h3><ul class="small" style="padding-left:18px;line-height:2">' +
    "<li>Consent + role-based access + least-privilege permissions</li><li>Audit trail for logins, case events, documents, permissions and messages</li><li>Data export & deletion available; session timeout enforced in production</li><li>Encryption-ready architecture; sensitive data excluded from analytics</li>" +
    "<li>Analytics: time_to_first_action · emergency_escalation_rate · tasks_completed · claim_document_completeness · family_notifications · discharge_checklist_completion · case_resolution_time — never inferring medical conditions</li></ul></div>"));
}

/* ================================================================
   NOTIFICATIONS
   ================================================================ */
function notify(text, kind){
  audit("NOTIFICATION", text);
  const NOTE_STYLE = { surg:["Surgery has been scheduled.","Relevant family members with RECEIVE_ALERTS are notified. Medical details only for those with VIEW_MEDICAL."],
    disch:["Discharge preparation required.","Caregiver and transport tasks created in the case."],
    ict:["I-can't-talk pack ready.","Drafts waiting in the Action Center for your approval."],
    rec:["Follow-up appointment is tomorrow.","Confirm transport and prepare questions for the doctor."],
    ins:["Insurance claim documents are incomplete.","Check the missing items in Insurance & Claims."] }[kind] || [text,""];
  toast("🔔 " + NOTE_STYLE[0] + " " + NOTE_STYLE[1]);
}

/* ================================================================
   DEMO WALKTHROUGH
   ================================================================ */
function demoSteps(){
  return [
    ["1 · Open LIFEOS","Welcome screen with 8 entry points and Talk to LIFEOS.","Reset the demo to see the landing screen again."],
    ["2 · Select ACCIDENT","User taps SOMEONE IS INJURED.","Triage asks where the patient is."],
    ["3 · Describe the incident","“My friend slipped and may have fractured his leg.”","Free-text, no forms-first."],
    ["4 · Urgency assessed","AI triage flags non-life-threatening; 999 guidance always one tap away.","Danger words trigger the 999 CTA."],
    ["5 · Already at hospital","Case LX-XXXXXX is created.","Structured CASE_STATE is persisted."],
    ["6 · Incident summary","Plain-language AI summary, tagged AI-GENERATED SUMMARY.","Never presented as diagnosis."],
    ["7 · What happens next","Urgent tasks: confirm assessment, confirm surgery.","Task engine: owner · deadline · source · permission."],
    ["8 · Insurance profile","Demo Insurance Berhad, medical card + PA rider.","Panel status noted (sample data)."],
    ["9 · Claim checklist","Documents required by insurer configured → readiness %.","“Potentially required” language; never promises approval."],
    ["10 · Missing documents","Identity ✓ · Admission ✓ · Medical report ⚠ · Receipts ⚠","Uploads simulate OCR extraction."],
    ["11 · Doctor questions","Prepare for Doctor — grouped by diagnosis, procedure, risks, costs.","Builds only from verified case info."],
    ["12 · Family update","Template drafted → REVIEW → APPROVE → EXECUTE.","Nothing sends itself."],
    ["13 · Surgery status","Surgery scheduled → stage advances, GL task appears.","Notification generated."],
    ["14 · Discharge checklist","13 items; missing ones become tasks.","Transport + equipment surfaced."],
    ["15 · Recovery timeline","Day 1 → Day 3 → Week 1 → Week 2 → Follow-up.","“Follow your treating clinician's instructions.”"],
    ["16 · Case stays open","Case remains active until follow-up completes.","Close case from Case tab."]
  ];
}
function demoModal(){
  const list = h('<div style="max-height:52vh;overflow:auto"></div>');
  demoSteps().forEach(([t, d, s]) => {
    list.appendChild(h('<div class="docrow"><div style="flex:1"><b>' + esc(t) + '</b><div class="small">' + esc(d) + '</div><div class="small muted">' + esc(s) + "</div></div></div>"));
  });
  modal("Guided demo — Arthur's friend Daniel", list, [
    { label:"Run full scenario", cls:"primary", onClick: () => { runFullDemo(); } },
    { label:"Close" }
  ]);
}
function runFullDemo(){
  if (!S.caseId){ newCase(); S.mode="active"; save(); }
  S.tab = "case"; save(); render();
  toast("Demo scenario loaded — walk the tabs to replay the journey.");
  setTimeout(()=>{ modal("Demo running", "<p>The case of <b>Daniel Tan</b> is loaded. Suggested walkthrough:</p><ol class='small' style='padding-left:18px;line-height:1.9'><li>Home — AI coordinator & knowledge sources</li><li>Case — timeline, tasks, status updates (try Surgery scheduled)</li><li>Actions — approve the GL request & family update</li><li>Documents — add samples, watch claim readiness climb</li><li>Family — toggle permissions, see notification previews</li><li>Recovery, Directory, Audit</li></ol>", [{label:"Got it", cls:"primary"}]); }, 300);
}

/* ================================================================
   BOOT
   ================================================================ */
function doctorModal(){
  const cs = S.caseState;
  const cats = ["Diagnosis","Procedure","Risks","Recovery","Medication","Mobility","Follow-up","Warning signs","Rehabilitation","Costs"];
  const Q = {
    Diagnosis:["What exactly is the injury, and how severe is it?","Which imaging confirmed this, and what did it show?"],
    Procedure:["What exactly is the procedure, and who will perform it?","How long does the operation take, and what anaesthesia is used?"],
    Risks:["What are the main risks of this surgery, and how are they managed?","What complications should make us call the hospital immediately?"],
    Recovery:["What does recovery look like at 1 week and 6 weeks?","When can he bear weight / return to work?"],
    Medication:["Which medications are needed, and for how long?","Any interactions with existing medication or allergies?"],
    Mobility:["Is a wheelchair or crutches needed, and for how long?","What movement is restricted in the first 2 weeks?"],
    "Follow-up":["When is the follow-up appointment, and with whom?","What should be ready at that appointment?"],
    "Warning signs":["Which symptoms mean we should return to hospital immediately?","Who do we call after hours?"],
    Rehabilitation:["When does physiotherapy start, and how often?","Is a home exercise plan provided?"],
    Costs:["What will the procedure cost, and what is covered by the GL?","Which documents do you provide for the insurance claim?"]
  };
  const box = h('<div><p class="small muted">Generated from verified case information only — ' + esc(cs ? (cs.diagnosis_verified ? "diagnosis verified by clinician" : "diagnosis still unverified") : "") + '. Never a substitute for the consultation itself.</p><div style="max-height:48vh;overflow:auto" id="qbox"></div></div>');
  const qb = $("#qbox", box);
  cats.forEach(c => {
    const card = h('<div class="card" style="margin-bottom:10px"><h3 style="font-size:14px">' + esc(c) + "</h3></div>");
    (Q[c] || []).forEach(q => card.appendChild(h('<div class="small" style="padding:4px 0">• ' + esc(q) + "</div>")));
    qb.appendChild(card);
  });
  modal("Prepare for Doctor", box, [{ label:"Close", cls:"primary" }]);
}

function boot(){
  S = load() || defaultState();
  render();
  if (S.mode === "entry"){
    const b = h('<button class="btn sm ghost" style="position:fixed;right:14px;bottom:14px;z-index:50">▶ Guided demo</button>');
    b.onclick = demoModal;
    document.body.appendChild(b);
  } else {
    const b = h('<button class="btn sm ghost" style="position:fixed;right:14px;bottom:14px;z-index:50">▶ Guided demo</button>');
    b.onclick = demoModal;
    document.body.appendChild(b);
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape"){ const m = $(".modal-bg"); if (m) m.remove(); } });
}
boot();
