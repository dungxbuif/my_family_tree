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

test("GEDCOM restore rejects a duplicated individual or a family with a missing individual",()=>{
  for(const invalid of ["0 @I1@ INDI\n1 NAME Second","0 @F1@ FAM\n1 CHIL @missing@"]) {
    expect(()=>parseGedcom("0 HEAD\n0 @I1@ INDI\n1 NAME First\n"+invalid+"\n0 TRLR")).toThrow();
  }
});

test("a truncated GEDCOM cannot drop referenced families on restoration", () => {
  for (const tag of ["FAMC", "FAMS"])
    expect(() =>
      parseGedcom("0 HEAD\n0 @I1@ INDI\n1 NAME An\n1 " + tag + " @F2@\n0 TRLR"),
    ).toThrow();
});

test("GEDCOM individual pointers must match the family and role on round trip", () => {
  const data = exportToGedcom({
    persons: [
      { id: "a", full_name: "Cha", gender: "male" },
      { id: "b", full_name: "Mẹ", gender: "female" },
      { id: "c", full_name: "Con", gender: "other" },
    ],
    relationships: [
      { person_a: "a", person_b: "b", type: "marriage" },
      { person_a: "a", person_b: "c", type: "biological_child" },
      { person_a: "b", person_b: "c", type: "biological_child" },
    ],
  });
  const restored = parseGedcom(data);
  expect(restored.relationships).toHaveLength(3);
  for (const incomplete of [
    data.slice(0, data.indexOf("0 @F1@ FAM") + "0 @F1@ FAM".length),
    data.replace("1 HUSB @I1@", ""),
    data.replace("1 WIFE @I2@", ""),
    data.replace("1 CHIL @I3@", ""),
    data.replace("1 FAMC @F1@", "1 FAMS @F1@"),
    data.replace("1 FAMS @F1@", "1 FAMC @F1@"),
  ])
    expect(() => parseGedcom(incomplete)).toThrow();
});
