import type { Metadata } from "next";
import LegalPage, { Section } from "@/app/_components/LegalPage";

export const metadata: Metadata = {
  title: "이용약관 — DINARY",
};

export default function TermsPage() {
  return (
    <LegalPage kicker="TERMS" title="DINARY 이용약관" updated="2026년 9월 15일">
      <Section title="1. 서비스">
        <p>
          DINARY는 이용자가 직접 남기는 식사 기록장입니다. 식당에서 찍은 사진과 위치로 방문을
          인증하고, 그 기록을 지도와 달력으로 되돌아보게 합니다. 개인이 만들어 무료로 제공하며,
          예고 없이 기능이 바뀌거나 중단될 수 있습니다.
        </p>
      </Section>

      <Section title="2. 계정">
        <p>카카오 또는 구글 계정으로 로그인해 이용합니다. 계정 관리 책임은 이용자에게 있습니다.</p>
      </Section>

      <Section title="3. 기록의 소유">
        <p>
          이용자가 올린 사진과 글의 권리는 이용자에게 있습니다. 서비스는 이를 이용자에게
          보여주기 위해 저장하고 처리할 뿐, 다른 목적으로 쓰거나 공개하지 않습니다.
        </p>
      </Section>

      <Section title="4. 방문 인증">
        <p>
          인증마크는 식당 자리에서 직접 찍은 사진에만 부여됩니다. 위치를 속이거나 인증을
          우회하려는 시도는 금지합니다.
        </p>
      </Section>

      <Section title="5. 금지하는 것">
        <p>
          법을 어기는 내용, 타인의 권리를 침해하는 사진과 글, 서비스를 무리하게 자동 호출하는
          행위.
        </p>
      </Section>

      <Section title="6. 책임의 한계">
        <p>
          무료로 제공하는 개인 서비스이므로 데이터 손실, 서비스 중단, 인증 오류로 생긴 손해에
          대해 책임지지 않습니다. 중요한 기록은 내려받아 따로 보관하시기를 권합니다.
        </p>
      </Section>

      <Section title="7. 해지">
        <p>
          프로필 화면의 회원 탈퇴로 언제든 그만둘 수 있고, 탈퇴하면 기록은 모두 삭제됩니다.
        </p>
      </Section>

      <Section title="8. 문의">
        <p>yeahjun22@gmail.com</p>
      </Section>
    </LegalPage>
  );
}
