# IG Stories Review Checklist

Report: `/home/runner/work/micmap/micmap/logs/ig-stories-report.json`
Apply summary: `/home/runner/work/micmap/micmap/logs/ig-apply-summary.json`

## Summary
- Auto-applied safe writes: 2
- Review-required updates: 4
- Unmatched/new candidates: 0

## Auto-applied Safe Writes
- 1. Friday 10:00 PM Fear City Mic @ The Fear City Comedy Club
  Fields: flyerUrl, flyerDate
- 2. Monday 7:30 PM Comedians on the Loose @ Black Cat LES
  Fields: flyerUrl, flyerDate

## Review-Required Updates
### 1. @thefearcitycomedyclub (story)
- [ ] Approve
- [ ] Reject
- Confidence: 0.65
- Matched mic: Friday 10:00 PM Fear City Mic @ The Fear City Comedy Club
- Screenshot: `/home/runner/work/micmap/micmap/logs/ig-story-thefearcitycomedyclub-0.png`
- Reasons: extracted risky fields differ from current mic record
- Risky diffs:
  - day: `Friday` -> `Thursday`
  - startTime: `10:00 PM` -> `9pm`
  - name: `Fear City Mic` -> `Thursday Mic`

### 2. @thefearcitycomedyclub (story)
- [ ] Approve
- [ ] Reject
- Confidence: 0.76
- Matched mic: Friday 10:00 PM Fear City Mic @ The Fear City Comedy Club
- Screenshot: `/home/runner/work/micmap/micmap/logs/ig-story-thefearcitycomedyclub-3.png`
- Reasons: extracted risky fields differ from current mic record
- Risky diffs:
  - startTime: `10:00 PM` -> `6PM`
  - name: `Fear City Mic` -> `THE PROPHET MIC`
  - host: `@thefearcitycomedyclub` -> `MICHAEL SITVER & DEREK AHMED`

### 3. @thefearcitycomedyclub (story)
- [ ] Approve
- [ ] Reject
- Confidence: 0.76
- Matched mic: Friday 10:00 PM Fear City Mic @ The Fear City Comedy Club
- Screenshot: `/home/runner/work/micmap/micmap/logs/ig-story-thefearcitycomedyclub-4.png`
- Reasons: extracted risky fields differ from current mic record
- Risky diffs:
  - name: `Fear City Mic` -> `Friday Mic`
  - host: `@thefearcitycomedyclub` -> `Charlie Vogel`

### 4. @cotlcomedy (story)
- [ ] Approve
- [ ] Reject
- Confidence: 0.89
- Matched mic: Monday 7:30 PM Comedians on the Loose @ Black Cat LES
- Screenshot: `/home/runner/work/micmap/micmap/logs/ig-story-cotlcomedy-0.png`
- Reasons: extracted risky fields differ from current mic record
- Risky diffs:
  - startTime: `7:30 PM` -> `9:00 PM`
  - venueName: `Black Cat LES` -> `Comedians on the Loose`
  - name: `Comedians on the Loose` -> `MIC`

## Unmatched / New Candidate Events
- None

