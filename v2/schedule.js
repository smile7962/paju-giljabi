/* 출장ON AI · 경로 시간제약 계산 v1.0
 * AI가 아닌 결정론적 경로 탐색. OSRM Table driving durations in seconds.
 * 여러 방문약속(정시 시작), 방문지별 체류시간, 우선방문, 당일 복귀 상한.
 */
(function (root) {
  "use strict";
  const MAX_STOPS = 15;

  function clock(value, label) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || "")) {
      throw Error(label + "을(를) HH:MM 형식으로 입력하세요.");
    }
    const [hours, minutes] = value.split(":").map(Number);
    return (hours * 60 + minutes) * 60;
  }
  function formatClock(seconds) {
    const mins = Math.floor(seconds / 60);
    return String(Math.floor(mins / 60)).padStart(2, "0") + ":" +
      String(mins % 60).padStart(2, "0");
  }
  function validate(data, numberOfStops) {
    if (!Number.isInteger(numberOfStops) || numberOfStops < 1 || numberOfStops > MAX_STOPS) {
      throw Error("시간제약 경로는 방문지 1~15곳만 지원합니다.");
    }
    const depart = clock(data.depart, "출발시간");
    const defaultDwell = Number(data.dwell);
    if (!Number.isInteger(defaultDwell) || defaultDwell < 0 || defaultDwell > 180) {
      throw Error("기본 체류시간은 0~180분으로 설정하세요.");
    }
    const priority = Number(data.priority);
    if (!Number.isInteger(priority) || priority < -1 || priority >= numberOfStops) {
      throw Error("우선방문지를 확인하세요.");
    }
    const deadline = data.deadline ? clock(data.deadline, "최종 복귀시간") : null;
    if (deadline !== null && deadline <= depart) {
      throw Error("복귀 제한시간은 당일 출발시간 이후여야 합니다.");
    }
    // v1.1: each location owns a dwell override and optional exact appointment.
    // Empty duration uses the common default. No silent cross-stop assignment.
    const overrides = data.stops;
    if (overrides != null && (!Array.isArray(overrides) || overrides.length !== numberOfStops)) {
      throw Error("방문지별 시간설정 개수가 입력한 방문지와 다릅니다. 다시 설정하세요.");
    }
    const dwellSeconds = [], appointments = [];
    for (let i = 0; i < numberOfStops; i++) {
      const field = overrides?.[i] || {};
      const minutes = field.dwell === "" || field.dwell == null ? defaultDwell : Number(field.dwell);
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 180) {
        throw Error((i + 1) + "번 방문지의 체류시간은 0~180분이어야 합니다.");
      }
      dwellSeconds.push(minutes * 60);
      const time = String(field.appointment || "").trim();
      appointments.push(time ? clock(time, (i + 1) + "번 방문지 약속시각") : null);
      if (appointments[i] !== null && appointments[i] < depart) {
        throw Error((i + 1) + "번 약속시간이 출발시간보다 빠릅니다.");
      }
    }
    // Legacy v1.0 single-appointment input is supported for test/backward compatibility.
    if (overrides == null && data.appointment != null && Number(data.appointment) >= 0) {
      const index = Number(data.appointment);
      if (!Number.isInteger(index) || index >= numberOfStops) {
        throw Error("방문약속 출장지를 확인하세요.");
      }
      appointments[index] = clock(data.appointmentTime, "방문약속시간");
      if (appointments[index] < depart) throw Error("방문약속시간은 출발시간 이후여야 합니다.");
    }
    return { depart, dwellSeconds, priority, appointments, deadline };
  }
  function verifyMatrix(matrix, count) {
    if (!Array.isArray(matrix) || matrix.length !== count ||
        !matrix.every(row => Array.isArray(row) && row.length === count &&
          row.every(n => Number.isFinite(n) && n >= 0))) {
      throw Error("OSRM 시간행렬에 연결되지 않은 경로가 있습니다. 해당 주소를 확인하세요.");
    }
    return matrix;
  }
  async function fetchMatrix(points, base = "https://router.project-osrm.org") {
    const list = points.map(p => p.lng + "," + p.lat).join(";");
    const response = await fetch(base + "/table/v1/driving/" + list +
      "?annotations=duration");
    if (!response.ok) throw Error("도로망 시간행렬 서버 오류 (" + response.status + ")");
    const data = await response.json();
    if (data.code !== "Ok") throw Error("OSRM 시간행렬 계산 실패: " + (data.message || data.code));
    return verifyMatrix(data.durations, points.length);
  }
  function step(state, next, matrix, conditions) {
    const index = next - 1;
    const travel = Math.ceil(matrix[state.last][next]);
    const arrival = state.finish + travel;
    const promise = conditions.appointments[index];
    if (promise !== null && arrival > promise) return null;
    const wait = promise === null ? 0 : Math.max(0, promise - arrival);
    const start = arrival + wait;
    const finish = start + conditions.dwellSeconds[index];
    if (finish >= 86400) return null;
    if (conditions.deadline !== null &&
        finish + Math.ceil(matrix[next][0]) > conditions.deadline) return null;
    // Reject branches that cannot reach ANY still-unvisited appointment on time.
    for (let i = 0; i < conditions.appointments.length; i++) {
      const due = conditions.appointments[i];
      if (i === index || due === null || (state.mask & (1 << i))) continue;
      if (finish + Math.ceil(matrix[next][i + 1]) > due) return null;
    }
    return {
      mask: state.mask | (1 << index),
      last: next, finish,
      travel: state.travel + travel,
      waiting: state.waiting + wait,
      order: [...state.order, index],
      schedule: [...state.schedule, { index, arrival, start, finish, wait,
        dwellSeconds: conditions.dwellSeconds[index], appointment: promise !== null }]
    };
  }
  function fixedOrder(matrix, conditions) {
    const number = matrix.length - 1;
    if (conditions.priority > 0) throw Error("방문순서 유지 시 우선방문지가 첫 번째 방문지여야 합니다.");
    let state = { mask: 0, last: 0, finish: conditions.depart,
      travel: 0, waiting: 0, order: [], schedule: [] };
    for (let i = 1; i <= number; i++) {
      state = step(state, i, matrix, conditions);
      if (!state) return null;
    }
    return state;
  }
  function optimizedOrder(matrix, conditions) {
    const number = matrix.length - 1;
    const complete = (1 << number) - 1;
    // Deterministic beam search (not a mathematically guaranteed global optimum).
    // Keep diverse alternatives per depth; all remaining appointment deadlines prune late routes.
    let beam = [{
      mask: 0, last: 0, finish: conditions.depart,
      travel: 0, waiting: 0, order: [], schedule: []
    }];
    for (let depth = 0; depth < number; depth++) {
      const options = [];
      for (const state of beam) {
        for (let index = 0; index < number; index++) {
          if (state.mask & (1 << index)) continue;
          if (depth === 0 && conditions.priority >= 0 && conditions.priority !== index) continue;
          const candidate = step(state, index + 1, matrix, conditions);
          if (candidate) options.push(candidate);
        }
      }
      // Prefer early arrival in partial search, then shorter road travel.
      // Preserve branches ending at different nodes to avoid losing route diversity.
      options.sort((a,b) => a.finish - b.finish ||
        a.travel - b.travel || a.order.join(",").localeCompare(b.order.join(",")));
      const diverse = [];
      const used = new Map();
      for (const state of options) {
        const key = state.mask + "|" + state.last;
        const n = used.get(key) || 0;
        if (n >= 3) continue;
        used.set(key, n + 1);
        diverse.push(state);
        if (diverse.length >= 100) break;
      }
      beam = diverse;
      if (!beam.length) return null;
    }
    const finalStates = beam
      .filter(s => s.mask === complete)
      .map(s => ({
        ...s,
        returnTravel: Math.ceil(matrix[s.last][0]),
        returnAt: s.finish + Math.ceil(matrix[s.last][0])
      }))
      .filter(s => s.returnAt < 86400 &&
        (conditions.deadline === null || s.returnAt <= conditions.deadline));
    finalStates.sort((a,b) =>
      (a.travel + a.returnTravel) - (b.travel + b.returnTravel) ||
      a.returnAt - b.returnAt);
    return finalStates[0] || null;
  }
  function solve(matrix, raw, keepOrder = false) {
    verifyMatrix(matrix, matrix.length);
    const conditions = validate(raw, matrix.length - 1);
    const final = keepOrder ? fixedOrder(matrix, conditions) : optimizedOrder(matrix, conditions);
    if (!final) throw Error(
      "설정한 시간·우선방문 조건을 만족하는 경로를 찾지 못했습니다. " +
      "출발시간을 앞당기거나 약속·복귀시간을 조정하세요. " +
      "최적화는 휴리스틱으로 계산되므로 조건을 조정해 재시도할 수 있습니다."
    );
    const returnTravel = Math.ceil(matrix[final.last][0]);
    const returnAt = final.finish + returnTravel;
    if (returnAt >= 86400 ||
        (conditions.deadline !== null && returnAt > conditions.deadline)) {
      throw Error("설정된 복귀시간을 만족할 수 없습니다.");
    }
    return {
      order: final.order,
      stops: final.schedule.map(s => ({
        ...s,
        arrivalText: formatClock(s.arrival),
        startText: formatClock(s.start),
        finishText: formatClock(s.finish),
        waitMinutes: Math.ceil(s.wait / 60)
      })),
      departText: formatClock(conditions.depart),
      returnText: formatClock(returnAt),
      travelSeconds: final.travel + returnTravel,
      dwellSeconds: conditions.dwellSeconds.reduce((a,b) => a + b, 0),
      waitSeconds: final.waiting,
      method: keepOrder ? "입력 순서 검증" : "제약조건 기반 후보 경로 탐색"
    };
  }
  root.TripSchedule = { validate, solve, fetchMatrix, formatClock };
})(window);