"use client";

import { Person } from "@/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Database, Search } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import DefaultAvatar from "./DefaultAvatar";
import { FemaleIcon, MaleIcon } from "./GenderIcons";

// ── Helpers ──────────────────────────────────────────────────────────────────
const getGenderStyle = (gender: string) => {
  if (gender === "male") return "bg-sky-100 text-sky-600";
  if (gender === "female") return "bg-rose-100 text-rose-600";
  return "bg-stone-100 text-stone-600";
};

const getAvatarBg = (gender: string) => {
  if (gender === "male") return "bg-primary";
  if (gender === "female") return "bg-tertiary";
  return "bg-secondary";
};

export default function PersonSelector({
  persons,
  selectedId,
  onSelect,
  placeholder = "Chọn người...",
  label = "Gốc hiển thị",
  className = "w-full sm:w-72",
  showAllOption = false,
  allOptionLabel = "Toàn bộ dữ liệu",
}: {
  persons: Person[];
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  showAllOption?: boolean;
  allOptionLabel?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const currentPerson = persons.find((p) => p.id === selectedId);

  const filteredPersons = persons
    .filter((p) => {
      const searchStr = `${p.full_name} ${p.birth_year || ""}`.toLowerCase();
      return searchStr.includes(searchTerm.toLowerCase());
    })
    .slice(0, 20);

  const handleSelect = (personId: string | null) => {
    onSelect(personId);
    setIsOpen(false);
    setSearchTerm("");
    setHighlightedIndex(0);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="person-selector-options"
        role="combobox"
        className={`w-full min-h-12 flex items-center gap-3 bg-surface border rounded-2xl px-3 py-2 text-sm shadow-sm transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 group
          ${isOpen ? "border-amber-300 bg-white shadow-md ring-2 ring-amber-500/10" : "border-stone-200/60 hover:border-amber-300 hover:bg-surface hover:shadow-md"}`}
      >
        <div className="relative shrink-0">
          <div
            className={`size-8 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden ring-2 ring-white shadow-xs
            ${
              currentPerson
                ? `${getAvatarBg(currentPerson.gender)} text-white`
                : showAllOption && selectedId === null
                  ? "bg-stone-500 text-white"
                  : "bg-stone-100 text-stone-400"
            }`}
          >
            {currentPerson ? (
              currentPerson.avatar_url ? (
                <Image
                  unoptimized
                  src={currentPerson.avatar_url}
                  alt={currentPerson.full_name}
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                />
              ) : (
                <DefaultAvatar gender={currentPerson.gender} size={32} />
              )
            ) : showAllOption && selectedId === null ? (
              <Database className="size-4" />
            ) : (
              "?"
            )}
          </div>
          {currentPerson && (
            <div
              className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-2 ring-white shadow-xs flex items-center justify-center ${getGenderStyle(currentPerson.gender)}`}
            >
              {currentPerson.gender === "male" ? (
                <MaleIcon className="size-2.5" />
              ) : currentPerson.gender === "female" ? (
                <FemaleIcon className="size-2.5" />
              ) : null}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 text-left">
          {label && (
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest leading-none mb-0.5">
              {label}
            </p>
          )}
          <p className="truncate text-stone-800 font-semibold select-none leading-tight">
            {currentPerson
              ? `${currentPerson.full_name} ${currentPerson.birth_year ? `(${currentPerson.birth_year})` : ""}`
              : showAllOption && !selectedId
                ? allOptionLabel
                : placeholder}
          </p>
        </div>

        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3, ease: "easeInOut" }}
        >
          <ChevronDown
            className={`size-4 shrink-0 transition-colors ${isOpen ? "text-amber-600" : "text-stone-400 group-hover:text-stone-600"}`}
          />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
            id="person-selector-options"
            role="listbox"
            className="absolute z-50 mt-2 w-full min-w-[min(20rem,calc(100vw-2rem))] bg-surface border border-stone-200/80 rounded-2xl shadow-soft max-h-[min(24rem,60vh)] flex flex-col overflow-hidden ring-1 ring-black/5"
          >
            <div className="p-2 border-b border-stone-100/80 bg-stone-50/50 sticky top-0 z-10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone-400" />
                <input
                  type="text"
                  aria-label="Tìm thành viên"
                  className="w-full min-h-11 text-stone-900 placeholder-stone-400 bg-white border border-stone-200/80 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all shadow-sm"
                  placeholder="Tìm thành viên..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setHighlightedIndex((index) => Math.min(index + 1, filteredPersons.length - 1));
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setHighlightedIndex((index) => Math.max(index - 1, 0));
                    }
                    if (event.key === "Enter" && filteredPersons[highlightedIndex]) {
                      event.preventDefault();
                      handleSelect(filteredPersons[highlightedIndex].id);
                    }
                  }}
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-1.5 custom-scrollbar">
              {showAllOption && searchTerm.toLowerCase() === "" && (
                <button
                  onClick={() => handleSelect(null)}
                        role="option"
                        aria-selected={selectedId === null}
                        className={`w-full min-h-11 flex items-center gap-3 px-3 py-2 text-sm rounded-xl transition-all duration-200 group/item mb-1
                     ${
                       selectedId === null
                         ? "bg-amber-50 text-amber-900 border border-amber-200/50 shadow-sm"
                         : "text-stone-700 hover:bg-stone-100/80 border border-transparent"
                     }`}
                >
                  <div className="relative shrink-0">
                    <div className="size-8 rounded-full bg-stone-500 flex items-center justify-center text-white ring-1 ring-white shadow-xs">
                      <Database className="size-4" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p
                      className={`truncate ${selectedId === null ? "font-bold" : "font-medium group-hover/item:text-stone-900"}`}
                    >
                      {allOptionLabel}
                    </p>
                  </div>
                  {selectedId === null && (
                    <Check className="size-4 text-amber-600 shrink-0" />
                  )}
                </button>
              )}

              {filteredPersons.length > 0 ? (
                <div className="space-y-0.5">
                  {filteredPersons.map((person, index) => {
                    const isSelected = person.id === selectedId;
                    return (
                      <button
                        key={person.id}
                        onClick={() => handleSelect(person.id)}
                        role="option"
                        aria-selected={isSelected}
                        className={`w-full min-h-11 flex items-center gap-3 px-3 py-2 text-sm rounded-xl transition-all duration-200 group/item
                          ${
                            isSelected
                              ? "bg-amber-50 text-amber-900 border border-amber-200/50 shadow-sm"
                              : index === highlightedIndex
                                ? "bg-stone-100/80 text-stone-900 border border-stone-200"
                                : "text-stone-700 hover:bg-stone-100/80 border border-transparent"
                          }`}
                      >
                        <div className="relative shrink-0">
                          <div
                            className={`size-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white overflow-hidden ring-1 ring-white shadow-xs
                            ${getAvatarBg(person.gender)}`}
                          >
                            {person.avatar_url ? (
                              <Image
                                unoptimized
                                src={person.avatar_url}
                                alt={person.full_name}
                                width={32}
                                height={32}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <DefaultAvatar gender={person.gender} size={32} />
                            )}
                          </div>
                          <div
                            className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-1 ring-white shadow-xs flex items-center justify-center ${getGenderStyle(person.gender)}`}
                          >
                            {person.gender === "male" ? (
                              <MaleIcon className="size-2.5" />
                            ) : person.gender === "female" ? (
                              <FemaleIcon className="size-2.5" />
                            ) : null}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0 text-left">
                          <p
                            className={`truncate ${isSelected ? "font-bold" : "font-medium group-hover/item:text-stone-900"}`}
                          >
                            {person.full_name}{" "}
                            {person.birth_year ? (
                              <span className="text-stone-400 font-normal">
                                ({person.birth_year})
                              </span>
                            ) : null}
                          </p>
                          {person.generation != null && (
                            <p className="text-[10px] text-stone-400 font-medium">
                              Đời thứ {person.generation}
                            </p>
                          )}
                        </div>

                        {isSelected && (
                          <Check className="size-4 text-amber-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-8 text-center flex flex-col items-center justify-center gap-2">
                  <div className="size-10 rounded-full bg-stone-100 flex items-center justify-center mb-1">
                    <Search className="size-5 text-stone-300" />
                  </div>
                  <div className="text-sm font-medium text-stone-600">
                    Không tìm thấy kết quả
                  </div>
                  <div className="text-xs text-stone-400">
                    Thử tìm với tên khác
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
