"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Client, Project } from "./mock";

type CreateProjectInput = {
  name: string;
  clientId: number;
  status?: string;
  coordinator?: string;
  bd?: string;
  startDate?: string;
  targetDate?: string;
  budgetHours?: number;
  description?: string;
};

type CreateClientInput = {
  name: string;
  industry?: string;
  primaryContact?: string;
  email?: string;
};

type Ctx = {
  projects: Project[];
  clients: Client[];
  hydrated: boolean;
  projectById: (id: number) => Project | undefined;
  clientById: (id: number) => Client | undefined;
  refresh: () => Promise<void>;
  createProject: (
    input: CreateProjectInput,
  ) => Promise<{ ok: true; project: Project } | { ok: false; error: string }>;
  updateProject: (
    id: number,
    patch: Partial<{
      name: string;
      status: string;
      coordinator: string;
      bd: string;
      startDate: string;
      targetDate: string;
      budgetHours: number;
      loggedHours: number;
      progress: number;
      health: string;
      description: string | null;
      leadId: string | null;
    }>,
  ) => Promise<void>;
  deleteProject: (id: number) => Promise<{ ok: boolean; error?: string }>;
  toggleProjectMember: (id: number, name: string) => Promise<void>;
  updateClient: (
    id: number,
    patch: Partial<{
      name: string;
      industry: string;
      primaryContact: string;
      email: string;
    }>,
  ) => Promise<void>;
  createClient: (
    input: CreateClientInput,
  ) => Promise<{ ok: true; client: Client } | { ok: false; error: string }>;
  deleteClient: (id: number) => Promise<{ ok: boolean; error?: string }>;
};

const ProjectsCtx = createContext<Ctx | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        fetch("/api/projects", { cache: "no-store" }),
        fetch("/api/clients", { cache: "no-store" }),
      ]);
      if (pRes.ok) {
        const body = (await pRes.json()) as { projects: Project[] };
        setProjects(body.projects ?? []);
      } else {
        setProjects([]);
      }
      if (cRes.ok) {
        const body = (await cRes.json()) as { clients: Client[] };
        setClients(body.clients ?? []);
      } else {
        setClients([]);
      }
    } catch {
      /* ignore — network blip */
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setHydrated(true));
  }, [refresh]);

  const createProject = useCallback(
    async (input: CreateProjectInput) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return {
          ok: false as const,
          error: body.error ?? "Couldn't create project.",
        };
      }
      const body = (await res.json()) as { project: Project };
      setProjects((prev) => [body.project, ...prev]);
      return { ok: true as const, project: body.project };
    },
    [],
  );

  const updateProject = useCallback(
    async (
      id: number,
      patch: Partial<{
        name: string;
        status: string;
        coordinator: string;
        bd: string;
        startDate: string;
        targetDate: string;
        budgetHours: number;
        loggedHours: number;
        progress: number;
        health: string;
        description: string | null;
        leadId: string | null;
      }>,
    ) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      if (body.project) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === id ? (body.project as Project) : p,
          ),
        );
      }
    },
    [],
  );

  const deleteProject = useCallback(async (id: number) => {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? "Couldn't delete project." };
    }
    setProjects((prev) => prev.filter((p) => p.id !== id));
    return { ok: true };
  }, []);

  const toggleProjectMember = useCallback(
    async (id: number, name: string) => {
      const res = await fetch(`/api/projects/${id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, action: "toggle" }),
      });
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      if (Array.isArray(body.teamMembers)) {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, teamMembers: body.teamMembers } : p,
          ),
        );
      }
    },
    [],
  );

  const updateClient = useCallback(
    async (
      id: number,
      patch: Partial<{
        name: string;
        industry: string;
        primaryContact: string;
        email: string;
      }>,
    ) => {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      if (body.client) {
        setClients((prev) =>
          prev.map((c) => (c.id === id ? (body.client as Client) : c)),
        );
      }
    },
    [],
  );

  const deleteClient = useCallback(async (id: number) => {
    const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? "Couldn't delete client." };
    }
    setClients((prev) => prev.filter((c) => c.id !== id));
    return { ok: true };
  }, []);

  const createClient = useCallback(
    async (input: CreateClientInput) => {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return {
          ok: false as const,
          error: body.error ?? "Couldn't create client.",
        };
      }
      const body = (await res.json()) as { client: Client };
      setClients((prev) =>
        [...prev, body.client].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return { ok: true as const, client: body.client };
    },
    [],
  );

  const projectById = useCallback(
    (id: number) => projects.find((p) => p.id === id),
    [projects],
  );
  const clientById = useCallback(
    (id: number) => clients.find((c) => c.id === id),
    [clients],
  );

  return (
    <ProjectsCtx.Provider
      value={{
        projects,
        clients,
        hydrated,
        projectById,
        clientById,
        refresh,
        createProject,
        updateProject,
        deleteProject,
        toggleProjectMember,
        createClient,
        updateClient,
        deleteClient,
      }}
    >
      {children}
    </ProjectsCtx.Provider>
  );
}

export function useProjects(): Ctx {
  const c = useContext(ProjectsCtx);
  if (!c) throw new Error("useProjects must be used within ProjectsProvider");
  return c;
}
