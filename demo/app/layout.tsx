import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Poppins } from "next/font/google";
import "./globals.css";
import { TaskDrawerProvider } from "@/components/TaskDrawerProvider";
import { TasksProvider } from "@/lib/tasks-store";
import { NotificationsProvider } from "@/lib/notifications-store";
import { AccountsProvider } from "@/lib/account-store";
import { ProjectsProvider } from "@/lib/projects-store";
import { Providers } from "@/components/Providers";
import { ToastProvider } from "@/components/Toast";
import { BlockDialogProvider } from "@/components/BlockDialogProvider";

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

const description =
  "Run projects, see who's doing what, keep the work moving. Role-aware task and resource management for engineering services teams.";

export const metadata: Metadata = {
  title: {
    default: "Task Manager",
    template: "%s · Task Manager",
  },
  description,
  applicationName: "Task Manager",
  authors: [{ name: "Task Manager" }],
  keywords: [
    "task manager",
    "project tracker",
    "resource management",
    "kanban",
    "engineering services",
  ],
  openGraph: {
    title: "Task Manager",
    description,
    type: "website",
    siteName: "Task Manager",
  },
  twitter: {
    card: "summary",
    title: "Task Manager",
    description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#1A73E8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body>
        <Providers>
          <AccountsProvider>
            <ProjectsProvider>
              <ToastProvider>
                <NotificationsProvider>
                  <TasksProvider>
                    <BlockDialogProvider>
                      <TaskDrawerProvider>{children}</TaskDrawerProvider>
                    </BlockDialogProvider>
                  </TasksProvider>
                </NotificationsProvider>
              </ToastProvider>
            </ProjectsProvider>
          </AccountsProvider>
        </Providers>
      </body>
    </html>
  );
}
