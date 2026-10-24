import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Opens Gmail's "new message" window addressed to this e-mail (new tab). Works for any address, not only @gmail.com. */
export function gmailCompose(email: string, subject = "SITAM SPACE") {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}`;
}
