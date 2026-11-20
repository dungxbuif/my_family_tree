import { recordedLunarMonth } from "../dateHelpers";
import { Lunar } from "lunar-javascript";
import { FamilyDataError } from "./records";

type Part = number | null;
type DateParts = [Part, Part, Part];
const invalid = () =>
  new FamilyDataError("Ngày sinh hoặc ngày mất không hợp lệ.");

function validate([year, month, day]: DateParts, lunar = false) {
  if (year !== null && (!Number.isInteger(year) || year < 1 || year > 9999))
    throw invalid();
  if (
    month !== null &&
    (month === 0 || month < (lunar ? -12 : 1) || month > 12)
  )
    throw invalid();
  if (day === null) return;
  const leap =
    year === null || (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
  let maxDay = 31;
  if (lunar) maxDay = 30;
  else if (month === 2) maxDay = leap ? 29 : 28;
  else if ([4, 6, 9, 11].includes(month ?? 0)) maxDay = 30;
  if (day < 1 || day > maxDay) throw invalid();
}

function checkOrder(birth: DateParts, death: DateParts) {
  for (let part = 0; part < 3; part++) {
    const a = birth[part],
      b = death[part];
    if (a === null || b === null || a < b) return;
    if (b < a) throw new FamilyDataError("Ngày mất phải từ ngày sinh trở đi.");
  }
}
export function validateLifeDates(record: Record<string, unknown>) {
  const date = (prefix: string): DateParts =>
    ["year", "month", "day"].map(
      (part) => record[prefix + "_" + part] ?? null,
    ) as DateParts;
  const birth = date("birth"),
    death = date("death"),
    lunar = date("death_lunar");
  validate(birth);
  validate(death);
  lunar[1] = recordedLunarMonth(...death, ...lunar);
  validate(lunar, true);
  checkOrder(birth, death);
  const [y, m, d] = lunar;
  if (y !== null && m !== null && d !== null) {
    let solar;
    try {
      solar = Lunar.fromYmd(y, m, d).getSolar();
    } catch {
      throw invalid();
    }
    if (death.includes(null))
      checkOrder(birth, [solar.getYear(), solar.getMonth(), solar.getDay()]);
  }
  return lunar[1];
}
