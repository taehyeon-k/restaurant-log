import { LoginScreen } from "dinary-expo";

export const Default = () => <LoginScreen  />;
export const WithError = () => <LoginScreen params={{ error: "로그인 정보를 받지 못했습니다" }} />;
