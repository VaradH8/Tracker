import { describe, it, expect } from "vitest";
import { projectsRunBy } from "@/lib/access";
import type { Project } from "@/lib/mock";

/** Only the roster lanes matter to projectsRunBy. */
function project(id: number, lanes: Partial<Pick<Project, "leads" | "coordinators" | "developers" | "bds">>): Project {
  return { id, leads: [], coordinators: [], developers: [], bds: [], ...lanes } as unknown as Project;
}

describe("projectsRunBy — the projects a person leads or co-ordinates", () => {
  const projects = [
    project(1, { coordinators: ["Mansi"], developers: ["Divya"] }),
    project(2, { leads: ["Mansi"], developers: ["Rohit"] }),
    project(3, { developers: ["Mansi"] }),
    project(4, { bds: ["Mansi"] }),
  ];

  it("includes projects where they are Co-ordinator or Lead", () => {
    expect(projectsRunBy(projects, "Mansi")).toEqual(new Set([1, 2]));
  });

  it("does not count being a Developer or BD on a project as running it", () => {
    expect(projectsRunBy(projects, "Divya")).toEqual(new Set());
    expect(projectsRunBy(projects, "Rohit")).toEqual(new Set());
  });

  it("someone on no roster runs nothing", () => {
    expect(projectsRunBy(projects, "Nobody")).toEqual(new Set());
  });
});
