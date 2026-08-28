"""HER PICK REALLY WRITES — 26.99955 UAT, G-26.99955-UAT-04.

⛔ WHAT THIS EXISTS TO STOP HAPPENING AGAIN, stated first because it is a
money defect and not a cosmetic one. Until 2026-08-26 the model picker on
Manage moved a stored word and NOTHING ELSE. 26.93-06 (D-01) had taken
`voice_model` off the call path deliberately — a caller may name a job and
nothing else — and the parameter was left on three signatures with nothing
reading it. The card went on saying "which model writes your reflections and
desk notes" and naming her choice.

⭐ IT WAS CAUGHT BY HER OWN LEDGER during the walk-through: she had the cheap
reader selected and `claude-opus-5` wrote BOTH calls of the sitting. The
forecast was honest — it prices the model that actually answers — so the
figure was never the defect. THE CARD'S SENTENCE WAS. And the cost is real:
this app's own table prices opus-5 at 25.0 against haiku-4-5's 5.0, so
anyone picking the cheap reader to spend less was spending roughly five
times what they thought, on every reflection, with a card telling them
otherwise.

⭐⭐ HER RULING, 2026-08-26: "Let your pick do the writing" — chosen over
"stop the card claiming it", knowing that a cheaper reader may write less
well. And, put to her separately once the consequence was measured: the
picker offered THREE readers while the room had only ever run two, so she
ruled "Offer the two it has run" rather than let an unwitnessed model's
first live job be one of her own reflections.

⚠ THE FIX IS A TIER'S FILL, NOT A CALL'S ARGUMENT, and these cases are
shaped to keep it that way. `librarian_call`'s own docstring forbids a
caller naming a model, and that prohibition is what makes "every job has
exactly one tier" a test rather than a habit. So her pick chooses who fills
the ONE tier her card is about — which is only honest if that tier's job
list really is "your reflections and desk notes", and § 1 measures exactly
that rather than assuming it.

⛔ IT NEVER TOUCHES THE REAL HOME. Every case runs inside a temporary HOME
and the helper REFUSES TO YIELD unless `study_lib.room_config_dir()` really
resolved inside it — the settings file this fix now writes lives beside her
keys file, which is a directory she really has, holding a real paid key.

⛔ NO KEY VALUE IS READ, PRINTED OR WRITTEN ANYWHERE HERE, and nothing in
this file opens a connection: no transport is installed, so a case that
somehow reached one would fail rather than send.

Run: `TMPH=$(mktemp -d); HOME="$TMPH" python3 tests/test_voice_pick_reaches_the_call.py`
"""

import contextlib
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import librarian_call  # noqa: E402
import server          # noqa: E402
import study_lib       # noqa: E402


@contextlib.contextmanager
def temp_home():
    """A throwaway HOME, with a STRUCTURAL guard that the room's config
    directory really resolved inside it (lifted from the discipline
    `tests/test_spend_record.py` established for the same directory)."""
    prior = os.environ.get("HOME")
    tmp = tempfile.mkdtemp(prefix="studyroom-voice-pick-")
    os.environ["HOME"] = tmp
    try:
        resolved = str(study_lib.room_config_dir())
        if not resolved.startswith(str(Path(tmp).resolve()) + os.sep) \
                and not resolved.startswith(tmp + os.sep):
            raise AssertionError(
                "the room's config directory resolved OUTSIDE the temporary "
                "home — refusing to run rather than write anywhere near a "
                "real one")
        yield Path(tmp)
    finally:
        if prior is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = prior
        shutil.rmtree(tmp, ignore_errors=True)


@contextlib.contextmanager
def no_shell_overrides():
    """The shell says nothing about models, fills or keys.

    ⚠ WITHOUT THIS THE SUITE WOULD MEASURE THE MACHINE IT RUNS ON. A real
    `ANTHROPIC_API_KEY` lives on the owner's machine, and the resolver's
    default order is a fact about the environment at resolve time — so the
    cases below name the key they want present and clear everything else."""
    names = (list(server.VOICE_MODEL_ENV_NAMES) +
             list(librarian_call.FILL_ENV_NAMES.values()) +
             list(librarian_call.KEY_ENV_NAMES.values()) +
             list(librarian_call.BASE_ENV_NAMES.values()))
    saved = {n: os.environ.get(n) for n in names}
    for n in names:
        os.environ.pop(n, None)
    try:
        yield
    finally:
        for n, v in saved.items():
            if v is None:
                os.environ.pop(n, None)
            else:
                os.environ[n] = v


class Fake(object):
    """The smallest stand-in the two routes under test need. It captures
    what a route answered instead of writing it to a socket, and records
    anything the handler logged so a fail-open path can be SEEN to have
    been taken rather than inferred."""

    def __init__(self, store=None):
        self.answer = None
        self.code = None
        self.logged = []
        self._store = store or {"meta": {}, "items": {}}

    def json_response(self, data, code=200):
        self.answer = data
        self.code = code
        return data

    def json_error(self, code, msg):
        return self.json_response({"ok": False, "error": msg}, code=code)

    def log_message(self, *args):
        self.logged.append(args)

    def store_or_fresh(self):
        return self._store


def write_voice_fill(alias):
    fake = Fake()
    ok = server.StudyHandler._write_voice_fill(fake, alias)
    return ok, fake


def status(meta):
    fake = Fake(store={"meta": dict(meta or {}), "items": {}})
    server.StudyHandler.handle_librarian_status(fake)
    return fake.answer or {}


class FakeServer(object):
    def __init__(self, root):
        self.library_root = str(root)


class MetaFake(Fake):
    """A stand-in with just enough library behind it to drive the REAL
    `handle_meta`.

    ⚠ THIS EXISTS BECAUSE THE FIRST VERSION OF THIS SUITE HAD A HOLE, and
    the hole is the exact class this project keeps paying for: every case
    called `_write_voice_fill` directly, so deleting the line in
    `handle_meta` that CALLS it left them all green. A helper that works and
    is never reached is precisely the defect this file is named after,
    wearing different clothes. The route is driven now."""

    def __init__(self, root, meta=None):
        Fake.__init__(self, store={"meta": dict(meta or {}), "items": {}})
        self.server = FakeServer(root)
        self.root = root

    def load_store(self):
        return study_lib.load_store(str(self.root))

    # ⛔ THE REAL METHOD, BOUND — never a stub that records being called. A
    # stub would prove the route reaches SOMETHING named this; the claim is
    # that her pick reaches the FILL, and only the real writer can carry it
    # there.
    def _write_voice_fill(self, alias):
        return server.StudyHandler._write_voice_fill(self, alias)


def meta_route(root, data):
    fake = MetaFake(root)
    server.StudyHandler.handle_meta(fake, data)
    return fake


ANTHROPIC = librarian_call.KEY_ENV_NAMES["anthropic"]


# ---------------------------------------------------------------------------
# § 1 — the picker's SENTENCE and the tier it governs describe the same calls
# ---------------------------------------------------------------------------

class TheTierHerCardIsAbout(unittest.TestCase):

    def test_the_governed_tier_is_exactly_reflections_and_desk_notes(self):
        """⛔ THE CLAIM THAT MAKES ONE PICKER HONEST OVER A WHOLE TIER.

        Her card says the choice decides "which model writes your
        reflections and desk notes". That is only true if the tier the pick
        now fills carries THOSE jobs and no others — a tier quietly gaining
        a third kind of work would make her sentence false again without a
        byte of copy changing, which is exactly the shape of the defect this
        file is named after.

        ⚠ MEASURED FROM `JOBS`, never from a list typed here: the set is
        derived at execution, so a job added to the tier fails this case
        rather than sliding in behind a stale literal."""
        governed = sorted(
            job for job, row in librarian_call.JOBS.items()
            if row["tier"] == server.VOICE_GOVERNED_TIER)
        self.assertEqual(
            governed,
            ["archive_learning", "librarian_note", "reflection",
             "reflection_judge", "reflection_refine"],
            "the tier her picker now fills no longer carries exactly the "
            "reflection and desk-note work her card names — either a job "
            "moved tier or a new kind of work joined it, and her sentence "
            "is the thing that stops being true")

    def test_no_other_tier_carries_a_reflection_or_a_desk_note(self):
        """The other half of the same fact, and it cannot be inferred from
        the first: a reflection job appearing on a SECOND tier would leave
        her pick governing only some of her reflections, silently."""
        for job, row in librarian_call.JOBS.items():
            if row["tier"] == server.VOICE_GOVERNED_TIER:
                continue
            self.assertNotIn(
                "reflection", job,
                "a reflection job sits outside the tier her picker governs, "
                "so her pick would decide who writes some of her "
                "reflections and not others")
            self.assertNotIn(
                "librarian_note", job,
                "the desk note sits outside the tier her picker governs")

    def test_every_alias_the_picker_offers_can_really_fill_that_tier(self):
        """⛔ THE DEFECT ITSELF, AS AN ASSERTION. An alias the picker offers
        that no allow-list will accept is a choice that cannot reach a call
        — which is precisely what the third alias was for weeks.

        ⚠ Judged through `librarian_call.allowed_fill`, the one place a fill
        is judged, rather than by re-reading the table here."""
        for alias in server.VOICE_MODELS:
            pair = server.VOICE_ALIAS_FILLS.get(alias)
            self.assertIsNotNone(
                pair, "the picker offers " + repr(alias) + " and nothing "
                      "says which model that is")
            self.assertIsNotNone(
                librarian_call.allowed_fill(
                    pair, server.VOICE_GOVERNED_TIER, default=None),
                "the picker offers " + repr(alias) + " but " + repr(pair) +
                " may not fill the tier it governs — a choice that cannot "
                "reach a call")

    def test_the_picker_offers_nothing_the_room_has_not_run(self):
        """⭐ HER RULING of 2026-08-26, as a gate: "Offer the two it has
        run". The third alias named a model no tier's allow-list held and no
        live provider had ever answered, and once the pick began reaching
        the call its first real job would have been one of her reflections.

        ⚠ ASSERTED OVER THE ALLOW-LIST, NOT OVER THE WORD `sonnet`. Naming
        the retired alias here would make this case pass the day somebody
        added a DIFFERENT unwitnessed model, which is the failure it is
        for."""
        offered = set(server.VOICE_ALIAS_FILLS[a] for a in server.VOICE_MODELS)
        witnessed = set()
        for tier in librarian_call.TIERS:
            for pair in librarian_call.TIER_FILLS_ALLOWED.get(tier, ()):  # noqa: E501
                witnessed.add(tuple(pair))
        self.assertTrue(
            offered <= witnessed,
            "the picker offers a model that fills no tier at all: " +
            repr(sorted(offered - witnessed)))

    def test_the_client_holds_no_roster_of_its_own(self):
        """⭐⭐ THE DECISION LEFT THE CLIENT ENTIRELY — 26.99955 UAT
        G-…-OPENAI, her ruling of 2026-08-27. This case used to PIN TWO
        COPIES EQUAL: `server.VOICE_MODELS` was what the write path
        accepted, app.js typed its own array, and a third alias added to
        one alone would paint a button whose tap the other refused.

        ⛔ THAT PIN IS RETIRED BECAUSE THE SECOND COPY IS GONE, NOT BECAUSE
        IT STOPPED MATTERING. Which readers may be offered now depends on
        WHO IS ANSWERING — a routing only the server resolves — so the list
        cannot be typed into the client at all. ⚠ A retired pin is a
        dangerous thing, so this replaces it with the stronger claim: the
        client holds NO roster, and therefore cannot drift from one.

        ⛔ READ OVER SOURCE, and it fails on the exact regression it
        guards: someone typing the aliases back into app.js "so it works
        offline" re-creates the two-copy defect this ticket removed."""
        src = (REPO_ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn(
            "voice_models_offered", src,
            "the client never reads the roster the server sends, so the "
            "picker cannot be following who is answering")
        for alias in server.VOICE_MODELS:
            typed = "'" + alias + "'"
            self.assertNotIn(
                "var aliases = [" + typed, src,
                "app.js has typed its own roster again, starting with " +
                repr(alias) + " — that is the two-copy defect this ticket "
                "removed, and the copy the server resolves is the only one "
                "that can know who is answering")

    def test_every_offered_alias_is_answered_by_the_provider_it_is_filed_under(self):
        """⛔⛔ THE FAILURE THAT WOULD NOT LOOK LIKE ONE, and the reason the
        import-time guard grew a third half.

        The offered list is chosen by who is answering. An alias filed
        under the wrong provider is therefore offered to a room that has no
        credential for it: she taps, the fill is written, and the next call
        goes nowhere. ⚠ That is NOT a refused tap — it is a room that stops
        answering, and the pair really is allowed on the tier, so every
        other check in this file is perfectly happy.

        ⚠⚠ AND IT WOULD BE SILENT. A rejected model or a missing credential
        comes back through the same path an empty balance does, and that
        path surfaces as *the librarian had nothing to say* rather than as
        an error — measured on a separate run the same week, where 93 days
        were recorded as refusals with no call ever made."""
        for provider, aliases in server.VOICE_MODELS_BY_PROVIDER.items():
            self.assertTrue(aliases, "provider " + provider + " offers none")
            for alias in aliases:
                pair = server.VOICE_ALIAS_FILLS.get(alias)
                self.assertIsNotNone(
                    pair, "offered alias with no fill: " + repr(alias))
                self.assertEqual(
                    pair[0], provider,
                    "the picker offers " + repr(alias) + " to a " +
                    repr(provider) + " room and it is answered by " +
                    repr(pair[0]))
        self.assertEqual(
            sorted(server.VOICE_MODELS),
            sorted(a for aliases in server.VOICE_MODELS_BY_PROVIDER.values()
                   for a in aliases),
            "the storable set and the offered sets have drifted — an alias "
            "that can be stored but never offered, or offered and never "
            "stored, is a button that lies in one direction or the other")


# ---------------------------------------------------------------------------
# § 2 — her tap reaches the fill
# ---------------------------------------------------------------------------

class HerTapReachesTheFill(unittest.TestCase):

    def test_the_pick_becomes_the_tier_s_fill(self):
        """⭐ THE WHOLE RULING, DRIVEN END TO END: she picks, and the run
        that follows really is answered by what she picked.

        ⚠ ASSERTED THROUGH `resolve_routing`, the shipped resolver, reading
        the file the write actually produced — never over the writer's own
        arguments. A writer that dropped the value on the way to disk would
        pass a check made on its inputs."""
        with temp_home(), no_shell_overrides():
            os.environ[ANTHROPIC] = "x"          # PRESENCE only; never read
            try:
                for alias, expected in server.VOICE_ALIAS_FILLS.items():
                    ok, _ = write_voice_fill(alias)
                    self.assertTrue(ok, "the fill for " + repr(alias) +
                                    " was not written")
                    routing = librarian_call.resolve_routing(
                        librarian_call.load_settings())
                    self.assertEqual(
                        tuple(routing.fills[server.VOICE_GOVERNED_TIER]),
                        expected,
                        "picking " + repr(alias) + " did not change who "
                        "answers the tier her card is about")
            finally:
                os.environ.pop(ANTHROPIC, None)

    def test_the_meta_route_itself_reaches_the_fill(self):
        """⛔⛔ THE ROUTE, NOT THE HELPER — and this case exists because its
        absence was caught by a mutation drill rather than by reading.
        Deleting the one line in `handle_meta` that calls the writer left
        every other case in this file GREEN, because they all called the
        writer themselves. A working helper nothing reaches is exactly the
        shape of the defect this suite is named after.

        ⚠ Driven through the real `handle_meta` over a real temporary
        library, and asserted through the shipped resolver reading the file
        the route actually produced."""
        with temp_home(), no_shell_overrides():
            os.environ[ANTHROPIC] = "x"          # PRESENCE only; never read
            root = Path(tempfile.mkdtemp(prefix="studyroom-voice-lib-"))
            try:
                study_lib.save_store(str(root), study_lib.new_store(str(root)))
                fake = meta_route(root, {"voice_model": "haiku"})
                self.assertTrue(
                    (fake.answer or {}).get("ok"),
                    "the meta route refused her pick: " + repr(fake.answer))
                routing = librarian_call.resolve_routing(
                    librarian_call.load_settings())
                self.assertEqual(
                    tuple(routing.fills[server.VOICE_GOVERNED_TIER]),
                    server.VOICE_ALIAS_FILLS["haiku"],
                    "her pick reached the STORE but not the call — which is "
                    "the whole of the defect this file exists to close")
            finally:
                shutil.rmtree(root, ignore_errors=True)
                os.environ.pop(ANTHROPIC, None)

    def test_the_meta_route_still_refuses_an_alias_the_picker_dropped(self):
        """The control at the route: fail-closed AT THE WRITE is unchanged
        by any of this, so an alias the picker does not offer is refused
        before the merge and the stored value stays whatever it already was.

        ⭐⭐ THE ALIAS CHANGED 2026-08-27 FOR THE SAME REASON ITS SIBLING'S
        DID. It was `sonnet`, chosen the day she ruled sonnet off the
        picker; she reversed that the next day, the route then correctly
        ACCEPTED it, and this case went red on a premise that had stopped
        being true. ⛔ The replacement is a name no ruling can ever put on
        the picker, so what is driven is the RULE rather than today's
        roster — and it is asserted unoffered first, so it cannot quietly
        become a test of a name that has joined."""
        with temp_home(), no_shell_overrides():
            self.assertNotIn(
                "nonesuch", server.VOICE_MODELS,
                "the alias this case relies on being unoffered is on the "
                "picker, so it proves nothing about an unoffered one")
            root = Path(tempfile.mkdtemp(prefix="studyroom-voice-lib-"))
            try:
                study_lib.save_store(str(root), study_lib.new_store(str(root)))
                fake = meta_route(root, {"voice_model": "nonesuch"})
                self.assertEqual(fake.code, 400)
                self.assertEqual(
                    librarian_call.load_settings(), {},
                    "a refused alias still reached her settings file")
            finally:
                shutil.rmtree(root, ignore_errors=True)

    def test_the_write_keeps_every_other_setting(self):
        """⚠ READ-MODIFY-WRITE, ASSERTED. Her settings file also holds her
        bases, her timeouts and the ADDRESS-CONSENT RECORD. Rewriting it to
        one entry would silently re-open a consent question she has already
        answered — the one failure here that costs more than a setting."""
        with temp_home(), no_shell_overrides():
            librarian_call.save_settings({
                librarian_call.SETTINGS_CONSENT_KEY: "http://127.0.0.1:11434",
                "timeouts": {"good-cloud": 99},
                "fills": {"local": list(librarian_call.LOCAL_FILL)},
            })
            ok, _ = write_voice_fill("haiku")
            self.assertTrue(ok)
            after = librarian_call.load_settings()
            self.assertEqual(
                after.get(librarian_call.SETTINGS_CONSENT_KEY),
                "http://127.0.0.1:11434",
                "the address-consent record did not survive her model pick")
            self.assertEqual(after.get("timeouts"), {"good-cloud": 99})
            self.assertEqual(
                after["fills"]["local"], list(librarian_call.LOCAL_FILL),
                "another tier's fill did not survive her model pick")

    def test_an_alias_the_picker_does_not_offer_writes_nothing(self):
        """Fail-closed at the fill as well as at the store. `handle_meta`
        validates first, so this is the second line — and a second line is
        the point: the store's own gate is what stops an arbitrary string
        being saved, and this stops one becoming a fill if it ever were.

        ⭐⭐ THE ALIAS THIS DRIVES CHANGED 2026-08-27, AND THE REASON IS
        WORTH MORE THAN THE EDIT. It used to be `sonnet` — chosen when she
        had just ruled sonnet OFF the picker. She reversed that the next
        day, so sonnet became an alias the picker DOES offer and the write
        correctly succeeded: this case was passing on a premise that had
        become false, and it went red the moment its premise did. ⭐ That
        is the gate working, not a break.

        ⛔ THE REPLACEMENT IS DELIBERATELY NOT ANOTHER REAL MODEL NAME. Any
        real name can be offered later by a ruling of hers, and this case
        would go red again for the same reason — a case whose meaning
        depends on a product decision staying put is a case that will keep
        breaking. `nonesuch` can never be offered, so what this drives is
        the RULE (an unoffered alias writes nothing) rather than a fact
        about which readers are on the picker today.

        ⚠ It is asserted to really be unoffered first, so the case cannot
        quietly become a test of a name that has joined the picker."""
        with temp_home(), no_shell_overrides():
            self.assertNotIn(
                "nonesuch", server.VOICE_MODELS,
                "the alias this case relies on being unoffered is on the "
                "picker, so it proves nothing about an unoffered one")
            ok, _ = write_voice_fill("nonesuch")
            self.assertFalse(ok)
            self.assertEqual(
                librarian_call.load_settings(), {},
                "an alias the picker does not offer reached her settings")

    def test_a_settings_file_that_cannot_be_written_costs_the_fill_not_the_pick(self):
        """⚠ THE FAIL-OPEN ARM, DRIVEN RATHER THAN PROMISED — and the real
        thing, not a patched writer: the directory is made unwritable, which
        is the fixture the owner herself drove at the 2026-08-17 UAT for the
        record file beside it.

        ⛔ REFUSING HER PICK OVER A DISK ERROR WOULD BE WORSE. The meta write
        still lands, and the status route reports who will ACTUALLY answer —
        so a failed write shows up as the card naming the old reader, never
        as a card naming a reader that is not writing.

        ⚠⚠ THE OBVIOUS FIXTURE DOES NOT WORK HERE, AND FINDING OUT WHY IS
        WORTH RECORDING. `tests/test_spend_record.py` drives the record
        file's failure by making that directory unwritable — the owner's own
        2026-08-17 fixture. It cannot drive THIS one: every write through
        `save_settings` calls `study_lib.ensure_room_config_dir`, which
        deliberately RE-ASSERTS mode 0700 on the directory that holds her
        keys, so the chmod is undone before the write is attempted and the
        write succeeds. That is shipped behaviour and it is correct — a
        directory holding a credential should not be left however a umask
        found it — so the fixture moves rather than the code. Occupying the
        settings PATH with a directory makes the atomic rename fail for a
        real filesystem reason, with nothing stubbed."""
        with temp_home(), no_shell_overrides():
            study_lib.ensure_room_config_dir()
            librarian_call.settings_path().mkdir(parents=True, exist_ok=True)
            ok, fake = write_voice_fill("haiku")
            self.assertFalse(ok, "a settings file that cannot be replaced "
                                 "reported a successful write")
            self.assertTrue(fake.logged, "the fail-open path was taken in "
                                         "silence — nothing was logged, so "
                                         "nobody could discover it")


# ---------------------------------------------------------------------------
# § 3 — the card reports who will ACTUALLY write
# ---------------------------------------------------------------------------

class TheCardCannotName_A_Reader_That_Is_Not_Writing(unittest.TestCase):

    def test_the_status_names_the_reader_the_routing_resolved(self):
        """⛔ THE HALF THAT MAKES THE OLD DEFECT UNREACHABLE, and it is a
        different claim from § 2. § 2 says her tap moves the fill. This says
        the card reads the FILL back — so any other route to that fill (a
        shell value, a hand-edited settings file) also reaches her card
        instead of leaving it naming her stored word.

        Driven with the two DISAGREEING: the store says one reader, the
        settings file says the other. Before this fix the card believed the
        store."""
        with temp_home(), no_shell_overrides():
            os.environ[ANTHROPIC] = "x"          # PRESENCE only; never read
            try:
                librarian_call.save_settings({"fills": {
                    server.VOICE_GOVERNED_TIER:
                        list(server.VOICE_ALIAS_FILLS["haiku"])}})
                answer = status({"voice_model": "opus"})
                self.assertEqual(
                    answer.get("voice_model_effective"), "haiku",
                    "the card named the stored pick while a different "
                    "reader was going to do the writing — the exact "
                    "sentence this ticket exists to end")
                self.assertEqual(
                    answer.get("voice_model_stored"), "opus",
                    "her own stored pick stopped being reported, so the "
                    "picker can no longer mark HER choice or say what "
                    "diverged from it")
            finally:
                os.environ.pop(ANTHROPIC, None)

    def test_the_agreeing_case_is_the_control(self):
        """⚠ THE CONTROL THAT REFUSES A DEGENERATE FIX. A change that simply
        always answered one alias would satisfy the case above; this one
        fails it."""
        with temp_home(), no_shell_overrides():
            os.environ[ANTHROPIC] = "x"
            try:
                write_voice_fill("opus")
                answer = status({"voice_model": "opus"})
                self.assertEqual(answer.get("voice_model_effective"), "opus")
                self.assertEqual(answer.get("voice_model_stored"), "opus")
            finally:
                os.environ.pop(ANTHROPIC, None)

    def test_an_unrecognised_fill_says_nothing_rather_than_her_pick(self):
        """⛔⛔ THE CASE THAT CAUGHT THIS FIX'S OWN HOLE, AND IT IS WRITTEN
        THE OTHER WAY ROUND NOW.

        Its first version asserted that an unrecognised fill LEFT HER PICK
        STANDING, on the reasoning that there was no honest alias to show
        instead. ⚠ That reasoning was wrong, and the room it described was
        the old defect wearing new clothes: with no cloud credential the tier
        resolves to her own machine, `resolve_voice_model` is fail-closed to
        a picker alias, and the card would therefore have said a cloud model
        was writing her reflections while a 7B on her own laptop did it.

        ⭐ HER RULING G-…-03, 2026-08-26 ("Say plainly there is no choice
        here") is what this now holds: when nothing the picker offers is
        going to write, the route answers NOTHING, and the room says so in
        her own words where the picker would be. ⛔ Her stored pick is
        untouched and still reported — it is still hers, it just is not a
        claim about who is writing."""
        with temp_home(), no_shell_overrides():
            answer = status({"voice_model": "haiku"})
            self.assertIsNone(
                answer.get("voice_model_effective"),
                "the card named a reader the picker offers while something "
                "else was going to do the writing — the exact class of "
                "sentence this file exists to end")
            self.assertEqual(
                answer.get("voice_model_stored"), "haiku",
                "her own pick stopped being reported, so the room can no "
                "longer say what she had chosen")



# ---------------------------------------------------------------------------
# § 4 — the picker follows WHO IS ANSWERING (26.99955 UAT G-…-OPENAI)
#
# ⭐⭐ HER RULING, 2026-08-27, and it closes a question SHE raised herself on
# 2026-08-26: *"is the hiku, sonnet, opus is hard coded, if so how to adapt
# when the user is using OpenAI API?"* That day's answer was a SENTENCE —
# G-…-03's "choosing a model isn't available with what is answering here" —
# recorded at the time as a stopgap, because the engine underneath was never
# the limit: `librarian_call` resolves by TIER across all three providers and
# only the picker could not say so. This is the plumbing that sentence
# deferred, and these cases are what say it really landed.
#
# ⛔ HER LINE IS NOT RETIRED. A room answering from the person's OWN MACHINE
# still has no choice to offer and still says so — § 4's last case is that
# half, so a fix that made the sentence unreachable would go red.
# ---------------------------------------------------------------------------


@contextlib.contextmanager
def only_key(provider):
    """Exactly one cloud credential present, and nothing else in the shell.

    ⚠ PRESENCE IS ALL THE RESOLVER TESTS, and the value is never read here —
    nothing in this file opens a connection. ⛔ The value is deliberately not
    key-shaped: a string that could be mistaken for a real credential has no
    business in a test file that gets published."""
    with no_shell_overrides():
        if provider is not None:
            os.environ[librarian_call.KEY_ENV_NAMES[provider]] = "not-a-key"
        yield


class ThePickerFollowsWhoAnswers(unittest.TestCase):

    def test_an_openai_room_is_offered_openais_readers(self):
        """⭐ THE WHOLE RULING, DRIVEN: on a room whose librarian answers
        from OpenAI, the picker offers OpenAI's three and names one of them
        as the writer."""
        with temp_home(), only_key("openai"):
            answer = status({})
            self.assertEqual(
                answer.get("voice_models_offered"),
                list(server.VOICE_MODELS_BY_PROVIDER["openai"]),
                "an OpenAI room was not offered OpenAI's readers")
            self.assertIn(
                answer.get("voice_model_effective"),
                server.VOICE_MODELS_BY_PROVIDER["openai"],
                "the card names a writer that is not one of the readers it "
                "is offering")
            for alias in server.VOICE_MODELS_BY_PROVIDER["anthropic"]:
                self.assertNotIn(
                    alias, answer.get("voice_models_offered") or [],
                    "an OpenAI room was offered " + repr(alias) + ", which "
                    "it has no credential to reach — she would tap it, the "
                    "fill would be written, and the next call would go "
                    "nowhere")

    def test_an_anthropic_room_is_unchanged_by_any_of_this(self):
        """⛔ THE REGRESSION ARM. Everything above is a widening, and a
        widening that quietly changed what her own room offers would be the
        worst outcome of the lot."""
        with temp_home(), only_key("anthropic"):
            answer = status({})
            self.assertEqual(
                answer.get("voice_models_offered"),
                list(server.VOICE_MODELS_BY_PROVIDER["anthropic"]),
                "her own room's picker changed")
            self.assertIn(
                answer.get("voice_model_effective"),
                server.VOICE_MODELS_BY_PROVIDER["anthropic"])

    def test_a_room_on_its_own_machine_is_offered_nothing_and_says_so(self):
        """⛔⛔ G-…-03 SURVIVES INTACT, and this is the case that proves the
        new plumbing did not swallow her sentence.

        With no cloud credential anywhere, every tier is served by the
        person's own machine. There is one reader and no choice about it —
        so the roster is EMPTY and `voice_model_effective` is None, which is
        exactly what makes the client render her line where the picker
        would be. ⚠ An empty roster is a real answer, never a missing
        field."""
        with temp_home(), only_key(None):
            answer = status({})
            self.assertEqual(
                answer.get("voice_models_offered"), [],
                "a room answering from its own machine was offered a choice "
                "it does not have")
            self.assertIsNone(
                answer.get("voice_model_effective"),
                "the card named a reader the picker offers while the "
                "person's own machine was going to do the writing — the "
                "exact class of sentence this file exists to end")

    def test_the_offered_roster_follows_the_fill_and_not_the_key(self):
        """⚠ THE DISCRIMINATOR, AND IT MATTERS. The roster is derived from
        the fill actually IN FORCE for the governed tier, never from which
        key happens to be present — those two can differ (a fill she wrote,
        a fill from her shell), and the card's whole job is to name who will
        really write.

        Driven by writing an OpenAI fill into her settings while an
        Anthropic key is the only credential present: the roster must
        follow the FILL."""
        with temp_home(), only_key("anthropic"):
            librarian_call.save_settings(
                {"fills": {server.VOICE_GOVERNED_TIER:
                           list(server.VOICE_ALIAS_FILLS["terra"])}})
            answer = status({})
            self.assertEqual(
                answer.get("voice_models_offered"),
                list(server.VOICE_MODELS_BY_PROVIDER["openai"]),
                "the roster followed the KEY rather than the fill in force, "
                "so the card would offer readers that are not going to write")
            self.assertEqual(
                answer.get("voice_model_effective"), "terra",
                "the card did not name the reader the fill actually points "
                "at")


def main():
    suite = unittest.defaultTestLoader.loadTestsFromModule(
        sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    print("CASES", result.testsRun)
    print("GOVERNED TIER", server.VOICE_GOVERNED_TIER, "->",
          sorted(job for job, row in librarian_call.JOBS.items()
                 if row["tier"] == server.VOICE_GOVERNED_TIER))
    print("OFFERED", server.VOICE_MODELS)
    if result.wasSuccessful():
        print("test_voice_pick_reaches_the_call OK "
              "(her pick fills the tier her card is about, the card reports "
              "who will really write, and the picker offers nothing the "
              "room has not run)")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
