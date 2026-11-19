import { expect, test } from "bun:test";
import { exportToGedcom, parseGedcom } from "@/utils/gedcom";

test("GEDCOM preserves a known living Person separately from unknown and deceased people", () => {
  const states = [false, null, true];
  const data = exportToGedcom({
    persons: states.map((is_deceased, index) => ({
      id: String(index + 1),
      full_name: "Tên " + index,
      is_deceased,
    })),
    relationships: [],
  });
  expect(parseGedcom(data).persons.map((person) => person.is_deceased)).toEqual(
    states,
  );
});

test("recorded death facts override a stale living or unknown flag through GEDCOM", () => {
  const facts = [
    { is_deceased: false, death_year: 1987 },
    { is_deceased: null, death_year: 2023, death_month: 3, death_day: 25 },
    { is_deceased: false, death_month: 11, death_day: 15 },
    {
      is_deceased: null,
      death_lunar_year: 2023,
      death_lunar_month: -2,
      death_lunar_day: 4,
    },
  ];
  const gedcom = exportToGedcom({
    persons: facts.map((fact, i) => ({
      ...fact,
      id: String(i + 1),
      full_name: "Hồ sơ " + i,
    })),
    relationships: [],
  });
  expect(gedcom).not.toContain("_LIVING Y");
  expect(gedcom.match(/^1 DEAT Y$/gm)).toHaveLength(facts.length);
  expect(gedcom).toContain("2 DATE 1987");
  expect(gedcom).toContain("2 DATE 25 MAR 2023");
  const { persons } = parseGedcom(gedcom);
  for (const [index, fact] of facts.entries()) {
    expect(persons[index]).toMatchObject({ ...fact, is_deceased: true });
  }
});
