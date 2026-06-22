export type Role = "user" | "assistant";

export type Attachment = {
  name: string;
  size: number;
  content: string;
  truncated: boolean;
};

export type Msg = {
  role: Role;
  content: string;
  attachments?: Attachment[];
};

export type Persona = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  builtin: boolean;
};

export type Session = {
  id: string;
  name: string;
  messages: Msg[];
  personaId: string;
  createdAt: number;
  updatedAt: number;
};
