import "server-only";
import type { Role } from "@insedu/domain";
import { allStaff } from "./store";

/** Personal que hace clases o es profesional de la educación: el EDE pide su título o certificado. */
const WITH_DEGREE: Role[] = ["teacher", "head_teacher", "pie_professional", "psychologist", "counselor", "social_worker", "director", "inspector"];

export const degreeCandidates = () => allStaff().filter((p) => p.roles.some((r) => WITH_DEGREE.includes(r))).sort((a, b) => a.name.localeCompare(b.name, "es"));
