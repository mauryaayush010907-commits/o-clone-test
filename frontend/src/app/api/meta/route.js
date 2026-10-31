import { COUNTRIES, GENDER_VALUES, LANGUAGES } from "@/lib/prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Single source of truth for the optional filter vocabulary. */
export async function GET() {
  return Response.json({
    ok: true,
    countries: COUNTRIES,
    languages: LANGUAGES,
    genders: GENDER_VALUES,
  });
}
