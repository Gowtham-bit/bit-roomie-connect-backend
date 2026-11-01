import assert from "node:assert/strict";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080";

// Recreate calculateCompatibility unit logic from routes/roommates.js
function calculateCompatibility(s1, s2) {
  let score = 45;
  if (s1.department === s2.department) score += 10;
  if (s1.hometown && s2.hometown && s1.hometown.toLowerCase() === s2.hometown.toLowerCase()) score += 8;
  if (s1.language && s2.language && s1.language.toLowerCase() === s2.language.toLowerCase()) score += 8;
  if (s1.traits?.food && s1.traits?.food === s2.traits?.food) score += 6;
  if (s1.traits?.sleep && s1.traits?.sleep === s2.traits?.sleep) score += 6;
  if (s1.traits?.wake && s1.traits?.wake === s2.traits?.wake) score += 4;
  if (s1.traits?.cleanliness && s1.traits?.cleanliness === s2.traits?.cleanliness) score += 5;
  if (s1.traits?.noise && s1.traits?.noise === s2.traits?.noise) score += 5;
  if (s1.traits?.personality && s1.traits?.personality === s2.traits?.personality) score += 4;
  if (s1.traits?.study && s1.traits?.study === s2.traits?.study) score += 4;
  if (s1.traits?.visitors && s1.traits?.visitors === s2.traits?.visitors) score += 4;

  const sharedInterests = s1.interests?.filter((i) => s2.interests?.includes(i)) || [];
  score += Math.min(15, sharedInterests.length * 3);

  return Math.min(99, Math.max(55, Math.round(score)));
}

const testResults = [];

async function runTest(name, category, testFn) {
  const start = performance.now();
  try {
    await testFn();
    const duration = (performance.now() - start).toFixed(1);
    testResults.push({ name, category, status: "PASS", duration: `${duration}ms` });
    console.log(`  ✅ [PASS] ${name} (${duration}ms)`);
  } catch (err) {
    const duration = (performance.now() - start).toFixed(1);
    testResults.push({ name, category, status: "FAIL", duration: `${duration}ms`, error: err.message });
    console.error(`  ❌ [FAIL] ${name} (${duration}ms): ${err.message}`);
  }
}

async function main() {
  console.log("\n========================================================");
  console.log(" 🧪 BIT ROOMIE CONNECT - AUTOMATED FULL-STACK TEST SUITE ");
  console.log("========================================================\n");

  let adminToken = "";
  let wardenToken = "";
  let studentToken = "";

  // -----------------------------------------------------------
  // 1. UNIT TESTS: ALGORITHM & LOGIC
  // -----------------------------------------------------------
  console.log("--- 1. Unit Tests (Roommate Compatibility Algorithm) ---");

  await runTest("Compatibility: Lower Bound Clamp (Mismatch)", "Unit - Algorithm", () => {
    const s1 = { department: "CSE", hometown: "Salem", language: "Tamil", traits: { food: "Veg" }, interests: ["Coding"] };
    const s2 = { department: "MECH", hometown: "Chennai", language: "Hindi", traits: { food: "Non-Veg" }, interests: ["Singing"] };
    const score = calculateCompatibility(s1, s2);
    assert.equal(score, 55, `Expected score to clamp at minimum 55, got ${score}`);
  });

  await runTest("Compatibility: Upper Bound Clamp (Perfect Match)", "Unit - Algorithm", () => {
    const s1 = {
      department: "CSE",
      hometown: "Erode",
      language: "Tamil",
      traits: { food: "Veg", sleep: "11 PM", wake: "7 AM", cleanliness: "High", noise: "Low", personality: "Introvert", study: "Night", visitors: "Never" },
      interests: ["Coding", "Chess", "Reading", "Anime", "AI"],
    };
    const s2 = { ...s1 };
    const score = calculateCompatibility(s1, s2);
    assert.equal(score, 99, `Expected score to clamp at maximum 99, got ${score}`);
  });

  await runTest("Compatibility: Partial Trait Scoring", "Unit - Algorithm", () => {
    const s1 = {
      department: "CSE",
      hometown: "Coimbatore",
      language: "Tamil",
      traits: { food: "Non-Veg", sleep: "11 PM" },
      interests: ["Cricket", "Gaming"],
    };
    const s2 = {
      department: "CSE", // +10
      hometown: "Coimbatore", // +8
      language: "English", // 0
      traits: { food: "Non-Veg", sleep: "1 AM" }, // +6
      interests: ["Cricket"], // +3
    };
    // Base 45 + 10 + 8 + 6 + 3 = 72
    const score = calculateCompatibility(s1, s2);
    assert.equal(score, 72, `Expected calculated score 72, got ${score}`);
  });

  // -----------------------------------------------------------
  // 2. BACKEND API: HEALTH & DATABASE CONNECTIVITY
  // -----------------------------------------------------------
  console.log("\n--- 2. Backend Health & Database Connectivity ---");

  await runTest("Health Check Endpoint (GET /api/health)", "Backend API", async () => {
    const res = await fetch(`${BACKEND_URL}/api/health`);
    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.status, "ok", "Expected status ok");
    assert.equal(data.dbState, "Connected to MongoDB", `Expected active MongoDB, got ${data.dbState}`);
  });

  // -----------------------------------------------------------
  // 3. BACKEND API: AUTHENTICATION & ROLE-BASED ACCESS
  // -----------------------------------------------------------
  console.log("\n--- 3. Backend Authentication & RBAC ---");

  await runTest("Admin Login (POST /api/auth/login)", "Backend Auth", async () => {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regNo: "admin123", password: "admin", role: "admin" }),
    });
    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.token, "Expected JWT token");
    assert.equal(data.role, "admin", "Expected admin role");
    adminToken = data.token;
  });

  await runTest("Boys Warden Login (POST /api/auth/login)", "Backend Auth", async () => {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regNo: "warden123", password: "warden", role: "warden" }),
    });
    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.token, "Expected JWT token");
    assert.equal(data.user.wardenType, "Boys", "Expected Boys wardenType");
    wardenToken = data.token;
  });

  await runTest("Girls Warden Login (POST /api/auth/login)", "Backend Auth", async () => {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regNo: "gwarden123", password: "warden", role: "warden" }),
    });
    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.token, "Expected JWT token");
    assert.equal(data.user.wardenType, "Girls", "Expected Girls wardenType");
  });

  await runTest("Student Login (POST /api/auth/login)", "Backend Auth", async () => {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regNo: "7376242AD142", password: "password123" }),
    });
    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.token, "Expected JWT token");
    studentToken = data.token;
  });

  await runTest("Security: Reject Wrong Password (401 Unauthorized)", "Backend Auth", async () => {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regNo: "admin123", password: "wrong_password_123" }),
    });
    assert.equal(res.status, 401, `Expected 401 Unauthorized, got ${res.status}`);
  });

  await runTest("Security: Reject Empty Request Body (400 Bad Request)", "Backend Auth", async () => {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400, `Expected 400 Bad Request, got ${res.status}`);
  });

  await runTest("Security: Token Verification Middleware (GET /api/auth/me)", "Backend Auth", async () => {
    // Missing token
    const resMissing = await fetch(`${BACKEND_URL}/api/auth/me`);
    assert.equal(resMissing.status, 401, `Expected 401 when token missing, got ${resMissing.status}`);

    // Valid student token
    const resValid = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.equal(resValid.status, 200, `Expected 200 with valid token, got ${resValid.status}`);
    const data = await resValid.json();
    assert.equal(data.regNo, "7376242AD142", "Expected matching student regNo");
  });

  // -----------------------------------------------------------
  // 4. BACKEND API: HOSTELS, ROOMS & STATS
  // -----------------------------------------------------------
  console.log("\n--- 4. Backend Domain Services (Hostels, Rooms, Stats) ---");

  await runTest("Hostels Listing (GET /api/hostels)", "Backend Services", async () => {
    const res = await fetch(`${BACKEND_URL}/api/hostels`);
    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const hostels = await res.json();
    assert.ok(Array.isArray(hostels), "Expected array of hostels");
    assert.ok(hostels.length > 0, "Expected at least 1 hostel in database");
    assert.ok(hostels[0].name, "Hostel item missing name");
    assert.ok(typeof hostels[0].capacity === "number", "Hostel capacity must be a number");
  });

  await runTest("Rooms Listing (GET /api/rooms)", "Backend Services", async () => {
    const res = await fetch(`${BACKEND_URL}/api/rooms`);
    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const rooms = await res.json();
    assert.ok(Array.isArray(rooms), "Expected array of rooms");
    assert.ok(rooms.length > 0, "Expected at least 1 room in database");
    assert.ok(rooms[0].number || rooms[0].roomNumber, "Room missing room number");
  });

  await runTest("Portal Statistics (GET /api/stats)", "Backend Services", async () => {
    const res = await fetch(`${BACKEND_URL}/api/stats`);
    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.stats, "Expected stats object");
    assert.ok(typeof data.stats.students === "number", "Expected numeric student count");
    assert.ok(typeof data.stats.rooms === "number", "Expected numeric room count");
  });

  // -----------------------------------------------------------
  // 5. BACKEND API: ROOMMATES, APPLICATIONS, COMPLAINTS, ATTENDANCE
  // -----------------------------------------------------------
  console.log("\n--- 5. Backend Student Services (Roommates, Applications, Complaints) ---");

  await runTest("Roommate Matching Algorithm (GET /api/roommates/matches)", "Backend Services", async () => {
    const res = await fetch(`${BACKEND_URL}/api/roommates/matches?regNo=7376242AD142`);
    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const matches = await res.json();
    assert.ok(Array.isArray(matches), "Expected array of matches");
    if (matches.length > 0) {
      assert.ok(typeof matches[0].compatibility === "number", "Expected numeric compatibility score");
      assert.ok(matches[0].compatibility >= 55 && matches[0].compatibility <= 99, "Compatibility score must be between 55 and 99");
    }
  });

  await runTest("Hostel Applications (GET /api/applications)", "Backend Services", async () => {
    const res = await fetch(`${BACKEND_URL}/api/applications`);
    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const apps = await res.json();
    assert.ok(Array.isArray(apps), "Expected array of applications");
  });

  await runTest("Application Validation (POST /api/applications/apply missing fields)", "Backend Services", async () => {
    const res = await fetch(`${BACKEND_URL}/api/applications/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400, `Expected 400 validation error for missing fields, got ${res.status}`);
  });

  await runTest("Complaints Query (GET /api/complaints)", "Backend Services", async () => {
    const res = await fetch(`${BACKEND_URL}/api/complaints`);
    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const complaints = await res.json();
    assert.ok(Array.isArray(complaints), "Expected array of complaints");
  });

  await runTest("Attendance Query (GET /api/attendance)", "Backend Services", async () => {
    const res = await fetch(`${BACKEND_URL}/api/attendance`);
    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const attendance = await res.json();
    assert.ok(Array.isArray(attendance), "Expected array of attendance records");
  });

  // -----------------------------------------------------------
  // 6. FRONTEND WEB SERVER: ROUTE SMOKE TESTS
  // -----------------------------------------------------------
  console.log("\n--- 6. Frontend Web Server Smoke Tests (Port 8080) ---");

  const frontendRoutes = [
    { path: "/", name: "Root Route (/)" },
    { path: "/login", name: "Login Route (/login)" },
    { path: "/dashboard", name: "Dashboard Route (/dashboard)" },
    { path: "/roommates", name: "Roommates Route (/roommates)" },
    { path: "/hostels", name: "Hostels Route (/hostels)" },
    { path: "/warden", name: "Warden Portal (/warden)" },
    { path: "/admin", name: "Admin Portal (/admin)" },
  ];

  for (const route of frontendRoutes) {
    await runTest(`Frontend HTTP: ${route.name}`, "Frontend Smoke", async () => {
      const res = await fetch(`${FRONTEND_URL}${route.path}`);
      assert.equal(res.status, 200, `Expected 200 OK for ${route.path}, got ${res.status}`);
      const text = await res.text();
      assert.ok(text.length > 50, "Expected non-empty HTML response");
    });
  }

  // -----------------------------------------------------------
  // SUMMARY REPORT
  // -----------------------------------------------------------
  const total = testResults.length;
  const passed = testResults.filter((r) => r.status === "PASS").length;
  const failed = testResults.filter((r) => r.status === "FAIL").length;

  console.log("\n========================================================");
  console.log(` 📊 TEST EXECUTION SUMMARY: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  if (failed > 0) {
    console.log(` ⚠️  ${failed} TESTS FAILED`);
  } else {
    console.log(" 🎉 ALL TESTS PASSED SUCCESSFULLY!");
  }
  console.log("========================================================\n");

  return { total, passed, failed, testResults };
}

main().catch((e) => {
  console.error("Fatal test runner crash:", e);
  process.exit(1);
});
