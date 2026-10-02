# LIFEOS — AI Emergency & Recovery Coordinator

> **Stay calm. We'll coordinate the next step.**

LIFEOS is a coordination prototype for the moments when life suddenly goes wrong — an accident, a hospital admission, an insurance claim, a recovery. It converts **CHAOS → CASE → ACTIONS → PEOPLE → DOCUMENTS → NEXT STEPS**.

LIFEOS is **not** an AI doctor, lawyer, insurer or emergency dispatcher. It organizes information, prepares questions and drafts messages, and coordinates authorized actions around the professionals who do the real work.

## What it does

- **Entry triage** — 8 large-button entry points (Emergency, Injured, At hospital, Surgery, Insurance, Discharge, Recovery, I don't know what to do) + voice input (simulated in prototype)
- **Emergency Mode** — danger-sign check that escalates to Malaysia's **999 (MERS 999)** and SaveME 999 immediately; LIFEOS never delays emergency care
- **Case engine** — structured case state, AI-generated incident summary (always labeled), live timeline, task engine with owner/deadline/source/permission
- **AI Coordinator** — every answer tagged FACT / USER-PROVIDED / VERIFIED SOURCE / AI-GENERATED GUIDANCE / REQUIRES PROFESSIONAL CONFIRMATION, with a traceable knowledge layer ("Why are you telling me this?")
- **Insurance & Claims** — policy profile, panel status, Guarantee Letter request flow, claim-readiness computed only from insurer-configured required documents
- **Document Vault** — simulated upload + OCR field extraction; originals stay immutable
- **Family Circle** — explicit least-privilege permissions per contact (VIEW_STATUS, VIEW_MEDICAL, VIEW_FINANCIAL, VIEW_DOCUMENTS, RECEIVE_ALERTS, ACT_ON_BEHALF) with notification previews
- **Action Center** — every AI action is REVIEW → APPROVE → EXECUTE with reason, target, data-to-be-shared and audit log; the "I CAN'T TALK — HANDLE THIS" pack prepares drafts, never sends
- **Discharge & Recovery** — 13-item discharge checklist, Day 1 → Week 6 recovery timeline ("Follow your treating clinician's instructions")
- **Malaysia Directory** — admin-managed, validity-stamped ("Data valid as of …; confirm before relying on them"), no fabricated numbers
- **Audit trail** — LOGIN, CASE_CREATED, DOCUMENT_UPLOADED, PERMISSION_GRANTED/REVOKED, ACTION_APPROVED/EXECUTED, MESSAGE_SENT, CASE_CLOSED

## Demo scenario

The prototype ships with a synthetic patient (**Daniel Tan** — slip and fall, suspected leg fracture, Demo Hospital, Demo Insurance). Open the app and press **▶ Guided demo** to walk the full journey from "I don't know what to do" to a coordinated recovery.

No real patient data is used anywhere.

## Run locally

Static site — no build step:

```bash
npx serve .        # or: python3 -m http.server
# open http://localhost:3000
```

## Safety rules baked into the product

- Never claims "your insurance will pay" — says "may cover this; confirm with your insurer"
- Never diagnoses, never overrides medical professionals, never delays emergency care
- Never fabricates contact numbers, policy coverage or approvals
- Never sends sensitive information without explicit human approval
- Never exposes medical details to family members without the matching permission

## Status

Prototype (P0 scope complete). Production architecture per spec: Next.js/React PWA, Node/TypeScript backend, Supabase (Postgres/Auth/Storage), LLM abstraction layer, RAG knowledge layer.

---

*Data valid as of 2026-09-20. In an emergency in Malaysia, call 999 first.*
