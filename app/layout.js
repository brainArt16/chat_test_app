import "./globals.css";

export const metadata = {
  title: "Chat Test App",
  description: "Simple Socket.IO chat tester for ck_chat",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
