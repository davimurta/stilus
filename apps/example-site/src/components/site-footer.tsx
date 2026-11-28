import { Text } from "@davimurta/stilus-next";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <Text as="p" k="layout.footer.note">
          Oficina Exemplo. Site de demonstração do Stilus.
        </Text>
      </div>
    </footer>
  );
}
