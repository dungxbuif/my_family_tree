import { recordedLifeStatus } from "./dateHelpers";
import { FamilyDataError, uuid } from "./family/records";

export interface GedcomPerson {
  id?: string;
  full_name?: string | null;
  gender?: "male" | "female" | "other" | string;
  birth_year?: number | null;
  birth_month?: number | null;
  birth_day?: number | null;
  death_year?: number | null;
  death_month?: number | null;
  death_day?: number | null;
  death_lunar_year?: number | null;
  death_lunar_month?: number | null;
  death_lunar_day?: number | null;
  is_deceased?: boolean | null;
  is_in_law?: boolean;
  birth_order?: number | null;
  generation?: number | null;
  avatar_url?: string | null;
  note?: string | null;
}

export interface GedcomRelationship {
  type?: string;
  person_a?: string;
  person_b?: string;
}

function recordedDateParts(...parts: (number | null | undefined)[]) {
  return parts.map((part) => part ?? "?").join(" ");
}

type ParentType = "biological_child" | "adopted_child";
type Family = {
  id: string;
  husb?: string;
  wife?: string;
  children: Map<string, ParentType>;
};

function unsupportedPedigree() {
  return new FamilyDataError("GEDCOM cần ghi rõ quan hệ con ruột hoặc con nuôi cho từng gia đình. Hãy kiểm tra phả hệ trong tệp nguồn hoặc dùng bản JSON hay CSV.");
}

export function exportToGedcom(data: {
  persons: GedcomPerson[];
  relationships: GedcomRelationship[];
}): string {
  let gedcom = "";

  // Header (GEDCOM 7.0)
  gedcom += "0 HEAD\n";
  gedcom += "1 GEDC\n";
  gedcom += "2 VERS 7.0\n";
  gedcom += "1 SOUR Giapha_OS\n";
  gedcom += "2 NAME Giapha OS\n";
  gedcom += "2 VERS 0.1.0\n";

  const personMap = new Map(
    data.persons.filter((p) => !!p.id).map((p) => [p.id!, p]),
  );

  // Map original IDs to short export IDs (to satisfy 20-char XREF limit)
  const exportIdMap = new Map<string, string>();
  let personCounter = 1;
  for (const person of data.persons) {
    if (person.id) {
      exportIdMap.set(person.id, `I${personCounter++}`);
    }
  }

  const getIndiXref = (id: string | undefined) =>
    id ? `@${exportIdMap.get(id) || id.replace(/-/g, "")}@` : "";

  // Helper formatting Date
  const formatNum = (n: number | null) =>
    n && n > 0 ? String(n).padStart(2, "0") : "";

  const families: Family[] = [];
  function addFamily(husb?: string, wife?: string): Family {
    const family: Family = { id: `F${families.length + 1}`, husb, wife, children: new Map() };
    families.push(family);
    return family;
  }
  const coupleKey = (a: string, b: string) => JSON.stringify([a, b].sort());
  const couples = new Map<string, Family>();
  const parentsByChild = new Map<string, { id: string; type: ParentType }[]>();
  if (personMap.size !== data.persons.length) throw Error("Mã thành viên GEDCOM bị thiếu hoặc trùng lặp.");
  for (const { person_a: a, person_b: b, type } of data.relationships) {
    if (!a || !b || a === b || !personMap.has(a) || !personMap.has(b))
      throw Error("Quan hệ GEDCOM tham chiếu thành viên không hợp lệ.");
    if (type === "marriage") {
      const swap = personMap.get(a)?.gender !== "male" &&
        (personMap.get(b)?.gender === "male" || personMap.get(a)?.gender === "female");
      couples.set(coupleKey(a, b), swap ? addFamily(b, a) : addFamily(a, b));
    } else if (type === "biological_child" || type === "adopted_child") {
      const parents = parentsByChild.get(b) ?? [];
      parents.push({ id: a, type });
      parentsByChild.set(b, parents);
    } else throw unsupportedPedigree();
  }

  // A FAMC pedigree applies to all parents in that family. Only use a couple's
  // record if both are actual parents of this child with the same pedigree.
  const singleParents = new Map<string, Family>();
  for (const [child, parents] of parentsByChild) {
    const [first, second] = parents;
    const couple = parents.length === 2 && first.type === second.type &&
      couples.get(coupleKey(first.id, second.id));
    if (couple) {
      couple.children.set(child, first.type);
      continue;
    }
    for (const parent of parents) {
      // Distinct pedigrees for the same parent and child require distinct FAMs.
      const key = JSON.stringify([parent.id, parent.type]);
      let family = singleParents.get(key);
      if (!family) {
        family = personMap.get(parent.id)?.gender === "female"
          ? addFamily(undefined, parent.id) : addFamily(parent.id);
        singleParents.set(key, family);
      }
      family.children.set(child, parent.type);
    }
  }

  // Map persons to their families (for FAMC and FAMS)
  const personFamc = new Map<string, Family[]>();
  const personFams = new Map<string, string[]>();

  for (const fam of families) {
    if (fam.husb) {
      const current = personFams.get(fam.husb) || [];
      if (!current.includes(fam.id))
        personFams.set(fam.husb, [...current, fam.id]);
    }
    if (fam.wife) {
      const current = personFams.get(fam.wife) || [];
      if (!current.includes(fam.id))
        personFams.set(fam.wife, [...current, fam.id]);
    }
    for (const childId of fam.children.keys()) {
      const current = personFamc.get(childId) || [];
      current.push(fam);
      personFamc.set(childId, current);
    }
  }

  // Export Individuals
  for (const person of data.persons) {
    if (!person.id) continue;
    gedcom += `0 ${getIndiXref(person.id)} INDI\n`;
    if (uuid.test(person.id)) gedcom += `1 UID ${person.id}\n`;

    // Name
    if (person.full_name) {
      const parts = person.full_name.trim().split(" ");
      const lastName = parts.length > 1 ? parts.pop() : "";
      const firstName = parts.join(" ");
      gedcom += `1 NAME ${firstName} /${lastName}/\n`;
    } else {
      gedcom += `1 NAME Unknown /Unknown/\n`;
    }

    // Sex
    if (person.gender === "male") gedcom += "1 SEX M\n";
    else if (person.gender === "female") gedcom += "1 SEX F\n";
    else gedcom += "1 SEX U\n";

    // Birth
    if (person.birth_year || person.birth_month || person.birth_day) {
      gedcom += "1 BIRT\n";
      const day = formatNum(person.birth_day ?? null);
      const mont = getMonthName(person.birth_month ?? null);
      const yea = person.birth_year ? String(person.birth_year) : "";
      const dateParts = [day, mont, yea].filter(Boolean);
      if (dateParts.length > 0) {
        gedcom += `2 DATE ${dateParts.join(" ")}\n`;
      }
    }

    const deceased = recordedLifeStatus(person);
    if (deceased === false) gedcom += "1 _LIVING Y\n";

    // Death
    if (deceased) {
      gedcom += "1 DEAT Y\n";
      const { death_year: year, death_month: month, death_day: day } = person;
      if (year && (!day || month)) {
        const date = [formatNum(day ?? null), getMonthName(month ?? null), year]
          .filter(Boolean)
          .join(" ");
        gedcom += `2 DATE ${date}\n`;
      } else if (year || month || day) {
        // A day without its month or year cannot be expressed as a standard DATE.
        gedcom += `2 _SOLAR_DATE ${recordedDateParts(year, month, day)}\n`;
      }
      const lunar = [
        person.death_lunar_year,
        person.death_lunar_month,
        person.death_lunar_day,
      ];
      if (lunar.some(Boolean))
        gedcom += `2 _LUNAR_DATE ${recordedDateParts(...lunar)}\n`;
    }

    // Family Links
    const famcs = personFamc.get(person.id) || [];
    for (const fam of famcs) {
      gedcom += `1 FAMC @${fam.id}@\n`;
      gedcom += `2 PEDI ${fam.children.get(person.id) === "adopted_child" ? "ADOPTED" : "BIRTH"}\n`;
    }
    const famss = personFams.get(person.id) || [];
    for (const famId of famss) {
      gedcom += `1 FAMS @${famId}@\n`;
    }

    // Note
    if (person.note) {
      const lines = person.note.split("\n");
      gedcom += `1 NOTE ${lines[0]}\n`;
      for (let i = 1; i < lines.length; i++) {
        gedcom += `2 CONT ${lines[i]}\n`;
      }
    }
  }

  for (const fam of families) {
    gedcom += `0 @${fam.id}@ FAM\n`;
    if (fam.husb) gedcom += `1 HUSB ${getIndiXref(fam.husb)}\n`;
    if (fam.wife) gedcom += `1 WIFE ${getIndiXref(fam.wife)}\n`;
    if (fam.husb && fam.wife) gedcom += "1 MARR Y\n";
    for (const childId of fam.children.keys()) {
      gedcom += `1 CHIL ${getIndiXref(childId)}\n`;
    }
  }

  gedcom += "0 TRLR\n";
  return gedcom;
}

function getMonthName(month: number | null): string {
  if (!month) return "";
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  return months[month - 1] || "";
}

function parseMonthName(name: string): number | null {
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const index = months.findIndex((m) => m === name.toUpperCase());
  return index !== -1 ? index + 1 : null;
}

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function parseGedcom(gedcom: string): {
  persons: GedcomPerson[];
  relationships: GedcomRelationship[];
} {
  const lines = gedcom.split(/\r?\n/).filter((line) => line.trim().length > 0);

  const persons: GedcomPerson[] = [];
  const relationships: GedcomRelationship[] = [];
  const idMap = new Map<string, string>();

  type ParseRecord = {
    type: "INDI" | "FAM";
    id: string;
    lines: string[];
  };

  const records: ParseRecord[] = [];
  let currentRecord: ParseRecord | null = null;
  let inHeader = false;
  let giaPhaSource = false;

  for (const line of lines) {
    if (line.startsWith("0 ")) {
      inHeader = line.trim() === "0 HEAD";
      if (currentRecord) records.push(currentRecord);
      const match = line.match(/^0\s+@([^@]+)@\s+(INDI|FAM)/);
      if (match) {
        currentRecord = {
          id: match[1],
          type: match[2] as "INDI" | "FAM",
          lines: [],
        };
      } else {
        currentRecord = null;
      }
    } else if (inHeader && line.trim() === "1 SOUR Giapha_OS") {
      giaPhaSource = true;
    } else if (currentRecord) {
      currentRecord.lines.push(line.trim());
    }
  }
  if (currentRecord) records.push(currentRecord);

  const expectedMembers = new Map<
    string,
    { FAMS: Set<string>; FAMC: Set<string> }
  >();

  const pedigrees = new Map<string, Map<string, ParentType>>();
  const personIds = new Set<string>();

  // Parse Individuals
  for (const record of records.filter((r) => r.type === "INDI")) {
    const uid = record.lines.find(line => line.startsWith("1 UID ") && uuid.test(line.slice(6)));
    const personId = uid ? uid.slice(6).toLowerCase() : generateUUID();
    if (idMap.has(record.id)) throw Error("Tệp GEDCOM có mã thành viên trùng lặp.");
    if (personIds.has(personId)) throw Error("Tệp GEDCOM có UID thành viên trùng lặp.");
    personIds.add(personId);
    idMap.set(record.id, personId);

    let fullName = "Unknown";
    let gender: "male" | "female" | "other" = "other";
    let is_deceased: boolean | null = null;
    let birth_day = null;
    let birth_month = null;
    let birth_year = null;
    let death_day = null;
    let death_month = null;
    let death_year = null;
    let death_lunar_year = null,
      death_lunar_month = null,
      death_lunar_day = null;
    let note = "";

    let currentTag = "";
    let childFamilyId = "";

    for (let i = 0; i < record.lines.length; i++) {
      const line = record.lines[i];
      const match = line.match(/^(\d+)\s+([A-Z0-9_]+)(?:\s+(.*))?$/);
      if (!match) continue;

      const level = parseInt(match[1]);
      const tag = match[2];
      const val = match[3] || "";

      if (level === 1) {
        currentTag = tag;
        // A separate adoption event can specify just one spouse, which a
        // family-wide pedigree cannot disambiguate during a replace restore.
        if (tag === "ADOP") throw unsupportedPedigree();
        if (tag === "FAMS" || tag === "FAMC") {
          const pointer = /^@([^@]+)@$/.exec(val);
          if (!pointer) throw Error("Tham chiếu gia đình GEDCOM không hợp lệ.");
          const familyId = pointer[1];
          const expected = expectedMembers.get(familyId) ?? {
            FAMS: new Set<string>(),
            FAMC: new Set<string>(),
          };
          if (tag === "FAMC") {
            childFamilyId = familyId;
            if (expected.FAMC.has(personId)) throw unsupportedPedigree();
          }
          expected[tag].add(personId);
          expectedMembers.set(familyId, expected);
        } else if (tag === "NAME") {
          fullName = val.replace(/\//g, "").trim();
        } else if (tag === "SEX") {
          if (val === "M") gender = "male";
          else if (val === "F") gender = "female";
        } else if (tag === "_LIVING" && val === "Y" && is_deceased !== true) {
          is_deceased = false;
        } else if (tag === "DEAT") {
          if (!val || val === "Y") is_deceased = true;
          else if (val === "N" && is_deceased !== true) is_deceased = false;
        } else if (tag === "NOTE") {
          note = val;
        }
      } else if (level === 2) {
        if (currentTag === "FAMC" && tag === "PEDI") {
          const pedigree = val.toUpperCase();
          const children = pedigrees.get(childFamilyId) ?? new Map<string, ParentType>();
          if (children.has(personId) || (pedigree !== "ADOPTED" && pedigree !== "BIRTH"))
            throw unsupportedPedigree();
          children.set(personId, pedigree === "ADOPTED" ? "adopted_child" : "biological_child");
          pedigrees.set(childFamilyId, children);
        } else if (currentTag === "NOTE" && tag === "CONT") {
          note += "\n" + val;
        } else if (currentTag === "BIRT" && tag === "DATE") {
          const cleanVal = val.replace(/^(ABT|EST|AFT|BEF|CAL)\s+/i, "");
          const parts = cleanVal.split(" ");
          if (parts.length === 3) {
            birth_day = parseInt(parts[0]) || null;
            birth_month = parseMonthName(parts[1]);
            birth_year = parseInt(parts[2]) || null;
          } else if (parts.length === 1) {
            birth_year = parseInt(parts[0]) || null;
          } else if (parts.length === 2) {
            birth_month = parseMonthName(parts[0]);
            birth_year = parseInt(parts[1]) || null;
          }
        } else if (
          currentTag === "DEAT" &&
          (tag === "_SOLAR_DATE" || tag === "_LUNAR_DATE")
        ) {
          const parts = val.trim().split(/\s+/);
          if (
            parts.length === 3 &&
            parts.every((part) => /^(?:-?\d+|\?)$/.test(part))
          ) {
            const date = parts.map((part) =>
              part === "?" ? null : Number(part),
            );
            if (date.some((part) => part !== null)) {
              is_deceased = true;
              if (tag === "_SOLAR_DATE")
                [death_year, death_month, death_day] = date;
              else
                [death_lunar_year, death_lunar_month, death_lunar_day] = date;
            }
          }
        } else if (currentTag === "DEAT" && tag === "DATE") {
          is_deceased = true;
          const cleanVal = val.replace(/^(ABT|EST|AFT|BEF|CAL)\s+/i, "");
          const parts = cleanVal.split(" ");
          if (parts.length === 3) {
            death_day = parseInt(parts[0]) || null;
            death_month = parseMonthName(parts[1]);
            death_year = parseInt(parts[2]) || null;
          } else if (parts.length === 1) {
            death_year = parseInt(parts[0]) || null;
          } else if (parts.length === 2) {
            death_month = parseMonthName(parts[0]);
            death_year = parseInt(parts[1]) || null;
          }
        }
      }
    }

    persons.push({
      id: personId,
      full_name: fullName,
      gender,
      is_deceased,
      birth_day: Number.isNaN(birth_day) ? null : birth_day,
      birth_month,
      birth_year: Number.isNaN(birth_year) ? null : birth_year,
      death_day: Number.isNaN(death_day) ? null : death_day,
      death_month,
      death_year: Number.isNaN(death_year) ? null : death_year,
      death_lunar_year,
      death_lunar_month,
      death_lunar_day,
      is_in_law: false,
      birth_order: null,
      generation: null,
      avatar_url: null,
      note: note.length > 0 ? note : null,
    });
  }

  // Parse Families
  const familyIds = new Set<string>();
  for (const record of records.filter((r) => r.type === "FAM")) {
    if (familyIds.has(record.id))
      throw Error("Tệp GEDCOM có mã gia đình trùng lặp.");
    familyIds.add(record.id);
    let husb = null;
    let wife = null;
    const children: string[] = [];

    for (const line of record.lines) {
      const match = line.match(/^1\s+(HUSB|WIFE|CHIL)\s+@([^@]+)@/);
      if (match) {
        const tag = match[1];
        const refId = match[2];
        const uuid = idMap.get(refId);
        if (!uuid) throw Error("Tệp GEDCOM tham chiếu thành viên không tồn tại.");

        if ((tag === "HUSB" && husb) || (tag === "WIFE" && wife))
          throw Error("Tệp GEDCOM có vai trò gia đình trùng lặp.");
        if (tag === "HUSB") husb = uuid;
        else if (tag === "WIFE") wife = uuid;
        else if (tag === "CHIL") children.push(uuid);
      }
    }

    const expected = expectedMembers.get(record.id);
    if (expected) {
      if (husb) expected.FAMS.delete(husb);
      if (wife) expected.FAMS.delete(wife);
      for (const child of children) expected.FAMC.delete(child);
      if (expected.FAMS.size || expected.FAMC.size)
        throw Error("Vai trò thành viên trong gia đình GEDCOM không khớp.");
      expectedMembers.delete(record.id);
    }
    if ((husb && husb === wife) || children.some(id => id === husb || id === wife)) throw Error("Quan hệ GEDCOM không hợp lệ.");
    // Earlier Gia Pha exports used a two-adult FAM to record marriage.
    // Their child links lack pedigree and are rejected below.
    const recordsMarriage = record.lines.some(line => /^1 MARR(?: Y)?$/.test(line));
    if (husb && wife && (recordsMarriage || (giaPhaSource && !children.length))) {
      relationships.push({
        type: "marriage",
        person_a: husb,
        person_b: wife,
      });
    }

    // Old exports omitted pedigree even for adoptions. A destructive import
    // must have an explicit supported FAMC.PEDI for every family child.
    for (const childId of children) {
      const type = pedigrees.get(record.id)?.get(childId);
      if (!type || (!husb && !wife)) throw unsupportedPedigree();
      for (const parent of [husb, wife])
        if (parent) relationships.push({ type, person_a: parent, person_b: childId });
    }
  }

  if (expectedMembers.size)
    throw Error("Tệp GEDCOM tham chiếu gia đình không tồn tại.");

  // Deduplicate relationships to prevent database unique constraint errors
  const uniqueRelationships: GedcomRelationship[] = [];
  const seenKeys = new Set<string>();

  for (const rel of relationships) {
    const key = `${rel.type}_${rel.person_a}_${rel.person_b}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueRelationships.push(rel);
    }
  }

  return { persons, relationships: uniqueRelationships };
}
