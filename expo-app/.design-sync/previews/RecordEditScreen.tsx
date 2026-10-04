import { RecordEditScreen } from "dinary-expo";

export const EditExisting = () => <RecordEditScreen params={{ id: "2" }} />;
export const NewRecord = () => <RecordEditScreen params={{ name: "을지면옥", address: "서울 중구 을지로3가 230-1", lat: "37.5662", lng: "126.9921" }} />;
