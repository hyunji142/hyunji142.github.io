// netlify/functions/messages.js
// POST /api/messages  — 메시지 등록
// GET  /api/messages  — 최신순 100건 조회
//
// 환경 변수 (Netlify 대시보드에서 직접 입력):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// CORS: 브라우저와 Function이 같은 Netlify 도메인에서 서비스되므로
//       same-origin 요청이 됩니다. ALLOWED_ORIGIN 환경 변수는 불필요합니다.

const { createClient } = require("@supabase/supabase-js");

// ── 유효성 검사 ────────────────────────────────────────────────
function validateNickname(v) {
  if (typeof v !== "string") return "별명은 문자열이어야 합니다.";
  const len = [...v].length; // 유니코드 글자 수 기준
  if (len < 2 || len > 12) return "별명은 2~12자여야 합니다.";
  return null;
}

function validateMessage(v) {
  if (typeof v !== "string") return "메시지는 문자열이어야 합니다.";
  const len = [...v].length;
  if (len < 1 || len > 100) return "메시지는 1~100자여야 합니다.";
  return null;
}

// ── 응답 헤더 ─────────────────────────────────────────────────
// same-origin 구조이므로 CORS 헤더 불필요
// Content-Type만 명시
const jsonHeaders = {
  "Content-Type": "application/json",
};

// ── 핸들러 ────────────────────────────────────────────────────
exports.handler = async (event) => {
  // OPTIONS preflight — same-origin이지만 방어적으로 처리
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: jsonHeaders, body: "" };
  }

  // 허용 메서드 외 차단
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...jsonHeaders, Allow: "GET, POST" },
      body: JSON.stringify({ error: "허용되지 않는 메서드입니다." }),
    };
  }

  // Supabase 클라이언트 (service_role — RLS 우회)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ── GET ──────────────────────────────────────────────────────
  if (event.httpMethod === "GET") {
    const { data, error } = await supabase
      .from("messages")
      .select("id, nickname, message, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("GET error:", error);
      return {
        statusCode: 500,
        headers: jsonHeaders,
        body: JSON.stringify({ error: "메시지를 불러오지 못했습니다." }),
      };
    }

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify(data),
    };
  }

  // ── POST ─────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: "요청 형식이 올바르지 않습니다." }),
    };
  }

  const { nickname, message } = body;

  const nicknameError = validateNickname(nickname);
  if (nicknameError) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: nicknameError }),
    };
  }

  const messageError = validateMessage(message);
  if (messageError) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: messageError }),
    };
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({ nickname, message })
    .select("id, nickname, message, created_at")
    .single();

  if (error) {
    console.error("POST error:", error);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: "저장에 실패했습니다. 다시 시도해 주세요." }),
    };
  }

  return {
    statusCode: 201,
    headers: jsonHeaders,
    body: JSON.stringify(data),
  };
};
