import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin/approve
 *
 * admin UI의 "승인" 버튼에서 호출됩니다.
 * GitHub API repository_dispatch를 트리거하여
 * publish-approved 워크플로우를 실행합니다.
 *
 * 요청 본문: { week_id: string, reviewed_by: string }
 * 필요 환경변수: ADMIN_SECRET, GITHUB_PAT, GITHUB_REPO
 */
export async function POST(request: NextRequest) {
  // ── 인증 확인 ──
  const cookieStore = cookies();
  const authCookie = cookieStore.get("admin_auth");
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || authCookie?.value !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 요청 파싱 ──
  const body = await request.json().catch(() => ({}));
  const { week_id, reviewed_by } = body as {
    week_id?: string;
    reviewed_by?: string;
  };

  if (!week_id || !reviewed_by) {
    return NextResponse.json(
      { error: "week_id와 reviewed_by는 필수입니다." },
      { status: 400 }
    );
  }

  // week_id 형식 검증
  if (!/^\d{4}-W\d{2}$/.test(week_id)) {
    return NextResponse.json(
      { error: `잘못된 week_id 형식: ${week_id}` },
      { status: 400 }
    );
  }

  // ── GitHub API 호출 ──
  const githubPat = process.env.GITHUB_PAT;
  const githubRepo = process.env.GITHUB_REPO; // "owner/repo" 형식

  if (!githubPat) {
    return NextResponse.json(
      { error: "GITHUB_PAT가 설정되지 않았습니다." },
      { status: 500 }
    );
  }
  if (!githubRepo) {
    return NextResponse.json(
      { error: "GITHUB_REPO가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${githubRepo}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubPat}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "approve-and-publish",
          client_payload: { week_id, reviewed_by },
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error(`GitHub API error: ${res.status} ${text}`);
      return NextResponse.json(
        { error: `GitHub API 호출 실패 (${res.status})` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "승인 요청이 전달되었습니다. GitHub Actions에서 자동 발행이 진행됩니다.",
      week_id,
      reviewed_by,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Failed to trigger workflow:", message);
    return NextResponse.json(
      { error: `워크플로우 트리거 실패: ${message}` },
      { status: 500 }
    );
  }
}
