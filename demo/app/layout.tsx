import type { Metadata } from "next";
import { Space_Grotesk, Poppins } from "next/font/google";
import "./globals.css";
import { TaskDrawerProvider } from "@/components/TaskDrawerProvider";
import { TasksProvider } from "@/lib/tasks-store";

const heading = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-heading",
  display: "swap",
});

const body = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Project Tracker",
  description: "Lightweight, role-aware work tracking — MVP demo.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body>
        <TasksProvider>
          <TaskDrawerProvider>{children}</TaskDrawerProvider>
        </TasksProvider>
      </body>
    </html>
  );
}
