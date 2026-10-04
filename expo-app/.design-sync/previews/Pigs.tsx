import { Pigs } from "dinary-expo";

export const Cheap = () => <Pigs row={{ price_level: 1, price_range: null }} w={24} h={22} />;
export const Moderate = () => <Pigs row={{ price_level: 3, price_range: null }} w={24} h={22} />;
export const Expensive = () => <Pigs row={{ price_level: 5, price_range: null }} w={24} h={22} />;
export const FromAmount = () => <Pigs row={{ price_level: null, price_range: 18000 }} w={24} h={22} />;
export const Small = () => <Pigs row={{ price_level: 2, price_range: null }} />;
