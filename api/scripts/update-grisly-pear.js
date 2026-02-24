const fs = require("fs");
const mics = JSON.parse(fs.readFileSync("api/mics.json", "utf8"));

const midtownBase = {
  borough: "Manhattan",
  neighborhood: "Midtown",
  address: "243 W 54th St, New York, NY 10019, USA",
  lat: 40.7645366,
  lon: -73.9833266,
  cost: "$5",
  stageTime: "5min",
  signUpDetails: "in person only",
  host: "Grisly Pear Staff (@grislypear)",
  notes: null
};

const macdougalBase = {
  borough: "Manhattan",
  neighborhood: "Greenwich Village",
  address: "107 MacDougal St, New York, NY 10012, USA",
  lat: 40.7298491,
  lon: -74.0008199,
  cost: "$5",
  stageTime: "5min",
  signUpDetails: "in person only",
  host: "Grisly Pear Staff (@grislypear)",
  notes: null
};

// Remove old Midtown entries: Tue 8PM mic-a-thon + Sat 3PM buddha
let result = mics.filter(m => {
  if (!m.venueName) return true;
  const isGPMidtown = m.venueName.includes("Grisly Pear Midtown") || m.venueName.includes("Mic-a-thon");
  if (!isGPMidtown) return true;
  if (m.day === "Tuesday" && m.startTime === "8:00 PM") {
    console.log("REMOVING:", m.name, m.day, m.startTime);
    return false;
  }
  if (m.day === "Saturday" && m.startTime === "3:00 PM") {
    console.log("REMOVING:", m.name, m.day, m.startTime);
    return false;
  }
  return true;
});

// Update existing Midtown entries
result.forEach(m => {
  if (!m.venueName) return;
  const isGPMidtown = m.venueName.includes("Grisly Pear Midtown") || m.venueName.includes("Mic-a-thon");
  if (!isGPMidtown) return;

  console.log("UPDATING:", m.name, m.day, m.startTime);
  m.name = "Grisly Pear Midtown";
  m.venueName = "Grisly Pear Midtown";
  m.cost = "$5";
  m.stageTime = "5min";
  m.signUpDetails = "in person only";
  m.host = "Grisly Pear Staff (@grislypear)";
  m.address = midtownBase.address;

  // Fix times: Thu and Fri should be 5:30 not 5:00
  if ((m.day === "Thursday" || m.day === "Friday") && m.startTime === "5:00 PM") {
    console.log("  -> fixing time to 5:30 PM");
    m.startTime = "5:30 PM";
    m.endTime = "7:00 PM";
  }

  // Sat 4PM - update end time
  if (m.day === "Saturday" && m.startTime === "4:00 PM") {
    m.endTime = "5:30 PM";
  }
});

// Add missing Midtown mics
const newMidtown = [
  { name: "Grisly Pear Midtown", day: "Monday", startTime: "5:30 PM", endTime: "7:00 PM", venueName: "Grisly Pear Midtown", ...midtownBase },
  { name: "Grisly Pear Midtown", day: "Tuesday", startTime: "7:00 PM", endTime: "8:30 PM", venueName: "Grisly Pear Midtown", ...midtownBase },
  { name: "Grisly Pear Midtown", day: "Tuesday", startTime: "9:00 PM", endTime: "10:30 PM", venueName: "Grisly Pear Midtown", ...midtownBase },
  { name: "Grisly Pear Midtown", day: "Tuesday", startTime: "10:30 PM", endTime: "12:00 AM", venueName: "Grisly Pear Midtown", ...midtownBase },
  { name: "Grisly Pear Midtown", day: "Wednesday", startTime: "5:30 PM", endTime: "7:00 PM", venueName: "Grisly Pear Midtown", ...midtownBase },
  { name: "Grisly Pear Midtown", day: "Sunday", startTime: "4:00 PM", endTime: "5:30 PM", venueName: "Grisly Pear Midtown", ...midtownBase },
];

// Add missing MacDougal Sat 2PM
const newMacdougal = [
  { name: "Grisly Pear", day: "Saturday", startTime: "2:00 PM", endTime: "3:30 PM", venueName: "Grisly Pear", ...macdougalBase },
];

result = result.concat(newMidtown, newMacdougal);

fs.writeFileSync("api/mics.json", JSON.stringify(result, null, 2) + "\n");

// Verify
const updated = JSON.parse(fs.readFileSync("api/mics.json", "utf8"));
const gp = updated.filter(m => m.name && m.name.toLowerCase().includes("grisly"));
console.log("\n=== All Grisly Pear mics after update ===");
gp.forEach(m => console.log("  " + (m.venueName || "").padEnd(22) + " | " + m.day.padEnd(10) + " " + m.startTime.padEnd(10) + " | " + m.cost + " | " + m.signUpDetails));
console.log("\nTotal Grisly Pear entries:", gp.length);
