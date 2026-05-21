'use client'

import { useState } from 'react'
import {
  BookOpen, Zap, FileSpreadsheet, Settings, Layers, Scissors,
  Sparkles, FolderOpen, Recycle, FileText, Lightbulb,
  AlertCircle, CheckCircle2, ChevronRight, Ruler, Hash, Package
} from 'lucide-react'

interface Section {
  id: string
  label: string
  icon: React.ReactNode
}

const SECTIONS: Section[] = [
  { id: 'overview',   label: 'Overview',              icon: <BookOpen size={14} /> },
  { id: 'quickstart', label: 'Quick Start (3 steps)', icon: <Zap size={14} /> },
  { id: 'settings',   label: 'Set Up Your Rolls',     icon: <Settings size={14} /> },
  { id: 'order',      label: 'Create a Work Order',   icon: <FileText size={14} /> },
  { id: 'import',     label: 'Import from Excel',     icon: <FileSpreadsheet size={14} /> },
  { id: 'fields',     label: 'Piece Fields Explained', icon: <Layers size={14} /> },
  { id: 'cutmode',    label: 'Cut Mode (Free vs Guillotine)', icon: <Scissors size={14} /> },
  { id: 'optimize',   label: 'Quick vs Deep Optimise', icon: <Sparkles size={14} /> },
  { id: 'result',     label: 'Reading the Cut Map',   icon: <Ruler size={14} /> },
  { id: 'leftovers',  label: 'Leftovers & Reuse',     icon: <Recycle size={14} /> },
  { id: 'jobs',       label: 'Jobs & History',        icon: <FolderOpen size={14} /> },
  { id: 'tips',       label: 'Tips & Common Issues',  icon: <Lightbulb size={14} /> },
]

export default function GuideView() {
  const [active, setActive] = useState<string>('overview')

  const scrollTo = (id: string) => {
    setActive(id)
    const el = document.getElementById(`guide-${id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-surface-800 flex items-center gap-2">
          <BookOpen size={20} className="text-brand-600" />
          User Guide
        </h2>
        <p className="text-sm text-surface-400 mt-1">
          A step-by-step walkthrough of how to plan a fabric roll cut with OptiRoll.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Sticky Table of Contents */}
        <aside className="col-span-12 lg:col-span-3">
          <div className="panel sticky top-4">
            <div className="panel-header">
              <h3 className="text-xs font-bold text-surface-600 uppercase tracking-wider">Contents</h3>
            </div>
            <nav className="p-2 space-y-0.5">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-xs transition-colors ${
                    active === s.id
                      ? 'bg-brand-50 text-brand-700 font-bold'
                      : 'text-surface-600 hover:bg-surface-50 hover:text-surface-800'
                  }`}
                >
                  <span className="shrink-0">{s.icon}</span>
                  <span className="flex-1 truncate">{s.label}</span>
                  {active === s.id && <ChevronRight size={11} />}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <main className="col-span-12 lg:col-span-9 space-y-5">

          {/* Overview */}
          <Card id="overview" icon={<BookOpen size={16} />} title="Overview">
            <p>
              OptiRoll plans how to cut fabric blinds out of long fabric rolls with the least waste. You enter the
              window pieces you need to make, the system arranges them on roll sheets, and gives you a printable
              cutting map.
            </p>
            <p>
              You don&apos;t have to do the maths — just feed it your sizes and tell it which rolls you have in stock.
            </p>
            <Callout type="tip" title="What you need before starting">
              <ul className="list-disc pl-4 space-y-1">
                <li>The list of pieces from the customer order (width × height per piece, in inches).</li>
                <li>The fabric roll widths your shop stocks (e.g. 2.5 m, 2.8 m).</li>
                <li>The maximum length each roll comes in (commonly 30 m).</li>
              </ul>
            </Callout>
          </Card>

          {/* Quick Start */}
          <Card id="quickstart" icon={<Zap size={16} />} title="Quick Start — Get a Cut Map in 3 Steps">
            <Step number={1} title="Open Settings, list your roll widths">
              Go to <Pill>Settings</Pill> in the sidebar. Add every roll width your factory uses (in metres).
              You only need to do this once.
            </Step>
            <Step number={2} title="Click New Order, fill in the pieces">
              Go to <Pill>New Order</Pill>. Enter a work order number and customer name. Then add each blind using
              the &quot;Add Piece to Order&quot; form, or upload an Excel file using <Pill>Import Excel</Pill>.
            </Step>
            <Step number={3} title="Click Generate Cutting Map">
              When all pieces are in the list, press <Pill>Generate Cutting Map</Pill>. The system shows you
              every sheet with the pieces arranged on it.
            </Step>
          </Card>

          {/* Settings */}
          <Card id="settings" icon={<Settings size={16} />} title="Step 1 · Set Up Your Rolls">
            <p>
              <Pill>Settings</Pill> is where you tell OptiRoll what fabric stock you have. There are three things to set:
            </p>
            <Field label="Roll Widths (m)">
              The widths of the fabric rolls you buy. Add each one. Example: <code>2.5</code>, <code>2.8</code>, <code>3.0</code>.
            </Field>
            <Field label="Max Roll Length (m)">
              How long one fresh roll is, in metres. The system will never let a sheet be longer than this. Most
              suppliers ship 30 m rolls, so the default is <code>30</code>.
            </Field>
            <Field label="Leftover Reuse Threshold">
              A safety percentage. Off-cuts narrower than this fraction of your selected roll are ignored. Default
              is <code>0.8</code> (80%). Lower it if you want to try squeezing pieces into smaller leftovers.
            </Field>
          </Card>

          {/* Create Order */}
          <Card id="order" icon={<FileText size={16} />} title="Step 2 · Create a Work Order">
            <p>
              Click <Pill>New Order</Pill> in the sidebar. The screen has three areas:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><b>Top left:</b> the work order number and customer name.</li>
              <li><b>Production List:</b> the form where you add one piece at a time.</li>
              <li><b>Pieces table:</b> the list of pieces you have added so far.</li>
            </ul>
            <Callout type="info" title="Per-piece, not per-order">
              Each piece carries its own type (roller / zebra), its own fabric, and its own roll-width choice.
              That means one work order can mix roller blinds and zebra blinds, or different colours, in a
              single optimisation.
            </Callout>
          </Card>

          {/* Import */}
          <Card id="import" icon={<FileSpreadsheet size={16} />} title="Importing from Excel">
            <p>
              If your customer or sales team sends you an Excel file (like a sales quotation), you don&apos;t need to
              re-type every row. Click <Pill>Import Excel</Pill> in the Production List.
            </p>
            <Step number={1} title="Pick the file">
              Choose any <code>.xlsx</code>, <code>.xls</code>, or <code>.csv</code>. Vendor preamble at the top
              (vendor name, date, voucher number, blank rows) is automatically skipped.
            </Step>
            <Step number={2} title="Check the column mapping">
              A preview window opens. The system tries to match each of its fields to a column in your file —
              for example <i>Sr No.</i> → <i>Shade #</i>, <i>Pcs</i> → <i>Qty</i>. If something looks wrong,
              change it from the dropdown.
            </Step>
            <Step number={3} title="Review the pieces, then click Confirm">
              You see a full table of every piece that will be added, with its size and quantity. Footer rows
              (GST, Total, Rounding Off) are silently dropped. When you&apos;re happy, click <Pill>Confirm &amp; Import</Pill>.
            </Step>
            <Callout type="tip" title="Sensible defaults">
              If your file doesn&apos;t have a Valence, Material, Colour, Pattern, or Roll Widths column, OptiRoll
              fills in safe defaults — Valence <b>6&quot;</b>, Material <b>Polyester</b>, Colour <b>White</b>,
              Pattern <b>Plain</b>, Roll Widths <b>All available</b>. You can edit any piece later if needed.
            </Callout>
          </Card>

          {/* Piece fields */}
          <Card id="fields" icon={<Layers size={16} />} title="Each Field Explained">
            <p className="text-surface-500 italic">When you add a piece to the production list, this is what each field means:</p>

            <FieldRow icon={<Package size={13} />} label="Roller / Zebra">
              The blind type. <b>Roller</b> is a single drop of fabric. <b>Zebra</b> uses double-layer fabric, so
              the system uses <code>(Height × 2) + Valence</code> when planning the cut. Choose per piece.
            </FieldRow>

            <FieldRow icon={<Hash size={13} />} label="Shade #">
              A unique reference for the piece — usually the line number from the order, or the room name
              (&quot;BR-001&quot;, &quot;Kitchen&quot;, etc.). Appears on the cut map so the cutter knows which one is which.
            </FieldRow>

            <FieldRow icon={<Ruler size={13} />} label='W (")'>
              The finished width of the blind, in <b>inches</b>. The piece needs to fit across the roll, so this
              must be smaller than the roll width you pick below.
            </FieldRow>

            <FieldRow icon={<Ruler size={13} />} label='H (")'>
              The finished height of the blind, in <b>inches</b> — measured from top of the pelmet/bracket to the
              bottom of the fabric.
            </FieldRow>

            <FieldRow icon={<Ruler size={13} />} label='Val (")'>
              Valence — the extra strip at the top that wraps the tube or pelmet. It defaults to <b>6&quot;</b>,
              which suits most installations. Adjust only when the customer needs a different wrap.
            </FieldRow>

            <FieldRow label="Qty">
              How many of this exact piece. The system will replicate it on the sheets that many times.
            </FieldRow>

            <FieldRow label="Material / Colour / Pattern">
              Three free-text fields describing the fabric. Pieces with <b>different</b> material, colour, or
              pattern are <b>never</b> placed on the same sheet — they go on separate sheets even if dimensions
              would fit together. This is what keeps your job physically cuttable from one roll at a time.
            </FieldRow>

            <FieldRow label="Roll Width for This Piece">
              The roll widths that this particular piece is allowed to use. You can pick one, several, or all.
              The optimiser will choose the most efficient width from the ones you select.
              <div className="mt-1.5 text-[11px] text-surface-500">
                Example: a small 24&quot; piece can live on a 2.5 m roll just as well as a 3.0 m one. Tick both,
                and OptiRoll will pick whichever gives less waste for the whole job.
              </div>
            </FieldRow>

            <FieldRow label="Final Height (read-only)">
              The total length of fabric this single piece consumes along the roll. For roller it is
              <code> Height + Valence</code>. For zebra it is <code>(Height × 2) + Valence</code>. Shown so you
              can sanity-check before adding.
            </FieldRow>
          </Card>

          {/* Cut Mode */}
          <Card id="cutmode" icon={<Scissors size={16} />} title="Cut Mode — Free vs Guillotine">
            <p>
              This toggle lives in the Production List, next to the roll width buttons. It changes how
              the system arranges pieces.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div className="border border-surface-200 rounded-lg p-3 bg-surface-50">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-100 text-brand-700">Free</span>
                  <span className="text-[11px] text-surface-500">— Default</span>
                </div>
                <p className="text-xs text-surface-700">
                  Packs pieces as tightly as possible to minimise waste. The cut lines may not all run
                  straight across the roll, so the cutter sometimes has to make smaller, individual cuts.
                </p>
                <p className="text-[11px] text-surface-500 mt-1.5">
                  Pick this for the <b>least waste</b>, when your cutter is happy doing per-piece cuts.
                </p>
              </div>

              <div className="border border-surface-200 rounded-lg p-3 bg-surface-50">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Guillotine</span>
                </div>
                <p className="text-xs text-surface-700">
                  Arranges pieces in straight horizontal strips. Every cut runs all the way across the roll,
                  so the layout works on a real fabric cross-cutting machine.
                </p>
                <p className="text-[11px] text-surface-500 mt-1.5">
                  Pick this when your machine <b>can only make straight cross-cuts</b>. Slightly more waste
                  than Free.
                </p>
              </div>
            </div>

            <Callout type="tip" title="If unsure, leave it on Free">
              Most users get the best results from Free. Switch to Guillotine only if your cutter complains
              about non-straight cut lines.
            </Callout>
          </Card>

          {/* Optimize Mode */}
          <Card id="optimize" icon={<Sparkles size={16} />} title="Quick vs Deep Optimise">
            <p>There are two buttons under the Pieces table:</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div className="border border-surface-200 rounded-lg p-3 bg-surface-50">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Scissors size={13} className="text-brand-600" />
                  <span className="text-sm font-bold text-surface-700">Generate Cutting Map</span>
                </div>
                <p className="text-xs text-surface-700">
                  The fast option. Runs in a fraction of a second and gives a good layout for almost any job.
                </p>
                <p className="text-[11px] text-surface-500 mt-1.5">
                  Use this for <b>day-to-day jobs</b>.
                </p>
              </div>

              <div className="border border-purple-200 rounded-lg p-3 bg-purple-50/40">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles size={13} className="text-purple-600" />
                  <span className="text-sm font-bold text-surface-700">Deep</span>
                </div>
                <p className="text-xs text-surface-700">
                  A slower, smarter search (1–5 seconds). Tries many more piece orderings to squeeze out a
                  little extra utilisation.
                </p>
                <p className="text-[11px] text-surface-500 mt-1.5">
                  Use this for <b>large orders</b> (20+ pieces) or <b>expensive fabric</b> where every extra
                  centimetre of waste matters.
                </p>
              </div>
            </div>
          </Card>

          {/* Reading the result */}
          <Card id="result" icon={<Ruler size={16} />} title="Reading the Cut Map">
            <p>After generating, the right side of the screen fills with results:</p>

            <Field label="Stats banner">
              Total pieces, total sheets used, fabric utilisation %, and waste %. Higher utilisation means less
              fabric thrown away.
            </Field>
            <Field label="Cut map canvas">
              One panel per sheet. Each piece is drawn to scale and labelled with the shade number, dimensions
              in inches, type (ROLLER / ZEBRA), and valence. Pass this to the cutter.
            </Field>
            <Field label="Download PNG / A3 PNG">
              Above each sheet — saves a printable image. <b>A3 PNG</b> is sized for an A3 printer (1748 × 2480 px).
            </Field>
            <Field label="Reusable leftovers">
              Off-cuts large enough to be worth saving are highlighted on the sheet and automatically added to
              the <Pill>Leftovers</Pill> inventory for the next job.
            </Field>
          </Card>

          {/* Leftovers */}
          <Card id="leftovers" icon={<Recycle size={16} />} title="Leftovers & Reuse">
            <p>
              When a sheet is cut, the unused tail of the roll (and any large rectangular off-cuts) are saved
              automatically. The next time you run a job with the same material, colour, and pattern, OptiRoll
              tries to use these leftovers <b>before</b> cutting into a fresh roll.
            </p>
            <p>
              You can see the current inventory in the <Pill>Leftovers</Pill> tab. From there you can add manually
              recovered off-cuts, edit dimensions, or remove ones that have been discarded.
            </p>
            <Callout type="info" title="Why some leftovers get skipped">
              A leftover is only considered if its width is at least <b>80%</b> of the roll width you&apos;ve picked
              for the new job. (You can change this in Settings → Leftover Reuse Threshold.)
            </Callout>
          </Card>

          {/* Jobs & History */}
          <Card id="jobs" icon={<FolderOpen size={16} />} title="Jobs & History">
            <p>
              Every optimised order is saved automatically.
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <Pill>Jobs</Pill> — every work order with its date, customer, pieces, sheets, and utilisation.
                Click one to re-open its cut map.
              </li>
              <li>
                <Pill>Activity</Pill> — a timeline of recent actions (logins, optimisations, leftover edits)
                useful for tracking who did what.
              </li>
              <li>
                <Pill>Dashboard</Pill> — at-a-glance metrics: jobs today, fabric saved, average utilisation.
              </li>
            </ul>
          </Card>

          {/* Tips */}
          <Card id="tips" icon={<Lightbulb size={16} />} title="Tips & Common Issues">
            <Callout type="tip" title="Group like with like">
              Pieces with the same material / colour / pattern share sheets and pack much better. Avoid splitting
              a fabric across two work orders if you can run them as one.
            </Callout>
            <Callout type="tip" title="Pick more than one roll width per piece">
              The more widths a piece is allowed to use, the more freedom the optimiser has. If you have 2.5 m
              and 2.8 m rolls in stock, tick both — let the system pick.
            </Callout>
            <Callout type="warn" title='"Piece too wide for any roll"'>
              The width you typed (in inches × 0.0254) is larger than every roll width you ticked. Either pick a
              wider roll, or double-check the dimension.
            </Callout>
            <Callout type="warn" title='"Final height exceeds max roll length"'>
              The piece is taller than your <code>Max Roll Length</code> setting — for zebra blinds remember the
              fabric is folded so the math is <code>(Height × 2) + Valence</code>. Raise the setting if your
              supplier ships longer rolls, or split the piece.
            </Callout>
            <Callout type="info" title="Imported pieces don't appear?">
              Open <Pill>Settings</Pill> first and make sure your roll widths are configured. The import skips
              any row whose roll width isn&apos;t in your list.
            </Callout>
          </Card>

        </main>
      </div>
    </div>
  )
}

/* ----------- Helpers ----------- */

function Card({ id, icon, title, children }: { id: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section id={`guide-${id}`} className="panel scroll-mt-4">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span className="text-brand-600">{icon}</span>
          <h3 className="text-sm font-bold text-surface-700">{title}</h3>
        </div>
      </div>
      <div className="panel-body space-y-3 text-sm text-surface-700 leading-relaxed">
        {children}
      </div>
    </section>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
        {number}
      </div>
      <div className="flex-1 pt-0.5">
        <p className="font-bold text-surface-800">{title}</p>
        <p className="text-surface-600 text-[13px] mt-0.5">{children}</p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-brand-200 pl-3 py-1">
      <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[13px] text-surface-600">{children}</p>
    </div>
  )
}

function FieldRow({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start py-2 border-b border-surface-100 last:border-b-0">
      <div className="w-32 shrink-0 flex items-center gap-1.5">
        {icon && <span className="text-surface-400">{icon}</span>}
        <span className="text-xs font-bold text-surface-700">{label}</span>
      </div>
      <div className="flex-1 text-[13px] text-surface-600">{children}</div>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded bg-surface-100 border border-surface-200 text-[11px] font-bold text-surface-700 font-mono">
      {children}
    </span>
  )
}

function Callout({ type, title, children }: { type: 'tip' | 'info' | 'warn'; title: string; children: React.ReactNode }) {
  const style = {
    tip:  { bg: 'bg-emerald-50',  border: 'border-emerald-200',  text: 'text-emerald-700',  icon: <CheckCircle2 size={13} /> },
    info: { bg: 'bg-sky-50',      border: 'border-sky-200',      text: 'text-sky-700',      icon: <Lightbulb size={13} /> },
    warn: { bg: 'bg-amber-50',    border: 'border-amber-200',    text: 'text-amber-700',    icon: <AlertCircle size={13} /> },
  }[type]
  return (
    <div className={`${style.bg} ${style.border} border rounded-lg px-3 py-2.5 mt-2`}>
      <p className={`text-xs font-bold ${style.text} flex items-center gap-1.5 mb-1`}>
        {style.icon} {title}
      </p>
      <div className={`text-[12px] ${style.text}/90 leading-relaxed`}>{children}</div>
    </div>
  )
}
