import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDisplayName, getPrimaryEmail } from "../lib/user-utils";

type SearchParams = {
  updated?: string | string[];
};

const getFirstValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const updateProfileAction = async (formData: FormData) => {
  "use server";

  const { userId } = await auth();

  if (!userId) {
    redirect("/login");
  }

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const preferredName = String(formData.get("preferredName") ?? "").trim();

  const client = await clerkClient();
  const currentUser = await client.users.getUser(userId);

  await client.users.updateUser(userId, {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    privateMetadata: {
      ...(currentUser.privateMetadata ?? {}),
      preferredName: preferredName || undefined
    }
  });

  revalidatePath("/profile");
  redirect("/profile?updated=1");
};

export default async function ProfilePage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { userId } = await auth();
  const client = await clerkClient();
  const user = userId ? await client.users.getUser(userId) : null;
  const resolvedSearchParams = await searchParams;
  const updated = getFirstValue(resolvedSearchParams?.updated) === "1";
  const displayName = user ? getDisplayName(user) : "";
  const primaryEmail = user ? getPrimaryEmail(user) : "";
  const preferredName =
    typeof user?.privateMetadata?.preferredName === "string"
      ? user.privateMetadata.preferredName
      : "";

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Profile</p>
        <h1>Your settings</h1>
        <p className="subhead">Update your profile details and preferences.</p>
        {updated ? <p className="notice">Profile updated.</p> : null}
        <div className="card">
          <h2>Profile info</h2>
          <p className="subhead">Signed in as {displayName}</p>
          <p className="subhead">Email: {primaryEmail}</p>
        </div>
        <form className="form" action={updateProfileAction}>
          <label className="form-label" htmlFor="preferredName">
            Preferred name
          </label>
          <input
            id="preferredName"
            name="preferredName"
            className="input"
            defaultValue={preferredName}
            placeholder="What should we call you?"
          />

          <label className="form-label" htmlFor="firstName">
            First name
          </label>
          <input
            id="firstName"
            name="firstName"
            className="input"
            defaultValue={user?.firstName ?? ""}
          />

          <label className="form-label" htmlFor="lastName">
            Last name
          </label>
          <input
            id="lastName"
            name="lastName"
            className="input"
            defaultValue={user?.lastName ?? ""}
          />

          <div className="actions">
            <button className="primary" type="submit">
              Save changes
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
