import "./globals.css";
export const metadata = { title: "FloorIQ", description: "AI quoting & takeoff for flooring stores" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
