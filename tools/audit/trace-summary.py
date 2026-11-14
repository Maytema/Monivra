# Where the time of a traced move went, per thread of the application: python3 trace-summary.py <trace> <package>
# Prints the CPU time of each thread of the application, and for the main thread, the render thread and the
# JavaScript thread the slices that took the most wall time (numbers in names folded, so "Choreographer#doFrame
# 123" and "… 124" count together), at the first three levels of nesting. Needs the `perfetto` package (trace
# processor); the audit workflow installs it.
import re
import sys
from collections import defaultdict

from perfetto.trace_processor import TraceProcessor

trace, package = sys.argv[1], sys.argv[2]
tp = TraceProcessor(trace=trace)
running = tp.query(f"""
  select thread.name as tname, sum(sched.dur)/1e6 as ms from sched join thread using (utid) join process using (upid)
  where process.name like '{package}%' group by thread.name order by ms desc limit 14
""").as_pandas_dataframe()
if running.empty:
    print(f"no process {package} in the trace")
    sys.exit(0)
print("CPU time by thread (ms):")
for _, r in running.iterrows():
    print(f"  {str(r['tname']):<28} {r['ms']:8.0f}")

rows = tp.query(f"""
  select slice.name as name, slice.dur as dur, slice.depth as depth, thread.name as tname, thread.is_main_thread as main
  from slice join thread_track on slice.track_id = thread_track.id join thread using (utid) join process using (upid)
  where process.name like '{package}%' and slice.depth <= 2
""").as_pandas_dataframe()
groups = defaultdict(lambda: defaultdict(lambda: [0, 0.0, 0.0]))
for _, r in rows.iterrows():
    thread = "main" if r["main"] == 1 else str(r["tname"])
    name = re.sub(r"\d+", "#", str(r["name"]))[:70]
    g = groups[thread][(int(r["depth"]), name)]
    ms = r["dur"] / 1e6
    g[0] += 1
    g[1] += ms
    g[2] = max(g[2], ms)
for thread in ["main", "RenderThread", "mqt_js", "mqt_v_js", "mqt_native", "CrRendererMain", "VizCompositorTh", "Chrome_InProcGp"]:
    if thread not in groups:
        continue
    print(f"\n{thread}: slices (level, name, count, total ms, longest ms)")
    for (depth, name), (n, ms, longest) in sorted(groups[thread].items(), key=lambda kv: -kv[1][1])[:24]:
        print(f"  {depth} {'  ' * depth}{name:<70} {n:5d} {ms:9.1f} {longest:8.1f}")
