import "./globals.css";

export const metadata = {
  title: "PokéFolio",
  description: "Gère et suis la valeur de ta collection de cartes Pokémon",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
