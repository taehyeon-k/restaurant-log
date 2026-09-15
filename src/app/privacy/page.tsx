import type { Metadata } from "next";
import LegalPage, { Section } from "@/app/_components/LegalPage";

export const metadata: Metadata = {
  title: "개인정보 처리방침 — DINARY",
};

export default function PrivacyPage() {
  return (
    <LegalPage kicker="PRIVACY" title="DINARY 개인정보 처리방침" updated="2026년 9월 15일">
      <p>
        DINARY(이하 &quot;서비스&quot;)는 개인이 만든 식사 기록 서비스입니다. 아래 내용은 서비스가
        어떤 정보를 받아 어떻게 쓰는지 정리한 것입니다.
      </p>

      <Section title="1. 수집하는 정보">
        <p>
          가. 로그인할 때 — 카카오 또는 구글로 로그인하면 해당 계정의 고유 식별자, 닉네임, 프로필
          사진 주소를 받습니다. 이메일·전화번호·성별·생년월일은 받지 않습니다.
        </p>
        <p>
          나. 서비스를 쓰면서 — 이용자가 직접 남긴 식당 이름, 주소, 메모, 별점, 가격, 사진, 방문
          날짜, 라벨, 가고 싶은 곳 목록이 저장됩니다.
        </p>
        <p>
          다. 방문 인증 — 사진을 찍어 방문을 인증할 때 기기의 위치를 읽어 근처 식당 후보를
          찾습니다. 이때 좌표 자체는 저장하지 않고, 위치 정확도(미터)와 인증이 통과한 시각만
          기록에 남습니다.
        </p>
      </Section>

      <Section title="2. 쓰는 곳">
        <p>
          받은 정보는 이용자 본인의 기록을 저장하고 보여주는 데에만 씁니다. 광고에 쓰지 않고,
          이용자를 분석해 다른 곳에 넘기지 않습니다.
        </p>
      </Section>

      <Section title="3. 공개 범위">
        <p>
          모든 기록은 비공개입니다. 다른 이용자에게 기록·사진·위치가 보이지 않으며, 지도에도
          본인 기록만 표시됩니다.
        </p>
      </Section>

      <Section title="4. 맡겨 둔 곳">
        <p>
          데이터베이스와 사진 보관에 Supabase, 웹 호스팅에 Vercel, 주소·장소 검색에 카카오 지도
          API를 씁니다. 각 사업자는 자신의 정책에 따라 정보를 처리합니다.
        </p>
      </Section>

      <Section title="5. 보관과 삭제">
        <p>
          기록은 이용자가 지우기 전까지 보관합니다. 프로필 화면의 회원 탈퇴를 누르면 계정과
          계정에 속한 기록·사진이 모두 삭제되며 되돌릴 수 없습니다. 개별 기록은 언제든 지울 수
          있습니다.
        </p>
      </Section>

      <Section title="6. 이용자의 권리">
        <p>
          언제든 본인 기록을 보고, 고치고, 내려받고, 지울 수 있습니다. 카카오·구글 계정 연결
          해제는 각 서비스의 연결된 앱 관리에서도 할 수 있습니다.
        </p>
      </Section>

      <Section title="7. 문의">
        <p>yeahjun22@gmail.com</p>
      </Section>
    </LegalPage>
  );
}
