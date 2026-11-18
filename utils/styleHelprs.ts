export function getAvatarBg(gender: string) {
  if (gender === "male") return "bg-primary";
  if (gender === "female") return "bg-tertiary";
  return "bg-secondary";
}
