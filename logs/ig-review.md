# IG Stories Review Checklist

Report: `/home/runner/work/micmap/micmap/logs/ig-stories-report.json`
Apply summary: `/home/runner/work/micmap/micmap/logs/ig-apply-summary.json`

## Summary
- Auto-applied safe writes: 2
- Review-required updates: 2
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
  - startTime: `10:00 PM` -> `9:00 PM`
  - name: `Fear City Mic` -> `Mic`

### 2. @cotlcomedy (story)
- [ ] Approve
- [ ] Reject
- Confidence: 0.81
- Matched mic: Monday 7:30 PM Comedians on the Loose @ Black Cat LES
- Screenshot: `/home/runner/work/micmap/micmap/logs/ig-story-cotlcomedy-0.png`
- Reasons: extracted risky fields differ from current mic record
- Risky diffs:
  - startTime: `7:30 PM` -> `9:00 PM`
  - name: `Comedians on the Loose` -> `MIC`

## Unmatched / New Candidate Events
- None

