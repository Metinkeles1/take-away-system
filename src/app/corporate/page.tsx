import { getCorporatesWithBalance } from "@/actions/corporate";
import CorporatePageClient from "./CorporatePageClient";

// Her istek için taze veri — aksi halde Next build time'daki snapshot'ı
// statik prerender eder ve eski açık bakiyeler kalır.
export const dynamic = "force-dynamic";

export default async function CorporatePage() {
  // İlk veri server'da hazırlanır — client mount olduğunda skeleton göstermek
  // gerekmez; loading.tsx tek geçiş olarak yeterli.
  const corporates = await getCorporatesWithBalance();

  return <CorporatePageClient initialCorporates={corporates} />;
}
