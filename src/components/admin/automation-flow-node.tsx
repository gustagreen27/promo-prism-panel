import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Play, MessageSquare, MousePointerClick, Image, Video, FileText, Clock3, GitBranch, Tags, Headphones, Globe, CircleStop, LayoutTemplate, Volume2, Shuffle, Ban } from "lucide-react";
import { BLOCK_MAP, isTrigger, outputsFor } from "@/lib/automation-graph";

export type FlowNodeData = { type: string; label?: string; config: Record<string, any>; summary?: string; invalid?: boolean; ordinal?: string };

export function blockAppearance(type: string, config: Record<string, any> = {}) {
  if (isTrigger(type)) return { tone: "start", icon: Play, label: "Início" };
  if (type === "send_text") return { tone: "text", icon: MessageSquare, label: "Texto" };
  if (type === "send_buttons") return { tone: "buttons", icon: MousePointerClick, label: "Texto + Botão" };
  if (type === "send_template") return { tone: "template", icon: LayoutTemplate, label: "Template" };
  if (type === "send_media") {
    const m = config.mediaType ?? "image";
    if (m === "audio") return { tone: "audio", icon: Volume2, label: "Áudio" };
    if (m === "video") return { tone: "video", icon: Video, label: "Vídeo" };
    if (m === "document") return { tone: "media", icon: FileText, label: "Documento" };
    return { tone: "media", icon: Image, label: "Imagem" };
  }
  if (type === "flow_random") return { tone: "random", icon: Shuffle, label: "Aleatorizador" };
  if (type === "act_blacklist") return { tone: "blacklist", icon: Ban, label: "Blacklist" };
  if (type.startsWith("wait_")) return { tone: "delay", icon: Clock3, label: type === "wait_duration" ? "Delay" : BLOCK_MAP[type]?.label };
  if (type.startsWith("cond_")) return { tone: "condition", icon: GitBranch, label: BLOCK_MAP[type]?.label };
  if (type === "act_handoff") return { tone: "handoff", icon: Headphones, label: "Atendimento" };
  if (type === "act_http") return { tone: "template", icon: Globe, label: "Requisição HTTP" };
  if (type === "end") return { tone: "end", icon: CircleStop, label: "Encerrar" };
  return { tone: "condition", icon: Tags, label: BLOCK_MAP[type]?.label };
}

const UNIT: Record<string, string> = { seconds: "s", minutes: " min", hours: "h", days: "d" };

export function AutomationFlowNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const def = BLOCK_MAP[data.type];
  if (!def) return null;
  const c = data.config ?? {};
  const appearance = blockAppearance(data.type, c);
  const Icon = appearance.icon;
  const trigger = isTrigger(data.type);
  const compact = data.type === "wait_duration" || data.type === "end";
  const solid = data.type === "act_blacklist";
  const outputs = outputsFor({ type: data.type, data: { config: c } });
  const replyTrigger = data.type === "trigger_campaign_reply" && outputs.length > 1;
  const text = c.text || c.caption || data.summary;
  const media = data.type === "send_media" ? (c.mediaType ?? "image") : null;

  return (
    <div className={`automation-node ${compact ? "automation-node-compact" : ""} ${solid ? "automation-node-solid" : ""}`} data-tone={appearance.tone} data-selected={selected} data-invalid={data.invalid}>
      {!trigger && <Handle type="target" position={Position.Left} className="automation-port" />}
      <div className="automation-node-heading">
        <span className="automation-node-icon"><Icon size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">{data.label || appearance.label}</div>
          {trigger && <div className="mt-0.5 text-[10px]">{def.label}</div>}
          {solid && <div className="mt-0.5 text-[10px]">Bloqueia o contato</div>}
          {compact && data.type === "wait_duration" && <div className="mt-0.5 text-base font-semibold">{c.amount}{UNIT[c.unit] ?? ""}</div>}
        </div>
        <span className="automation-node-number">{data.ordinal}</span>
      </div>

      {replyTrigger ? (
        <div className="automation-trigger-message">
          <div className="automation-node-body">{c.text || "Mensagem do disparo"}</div>
          {outputs.map((o) => (
            <div key={o.id} className="automation-node-output" style={{ color: o.id === "other" ? "var(--muted-foreground)" : "var(--flow-text)" }}>
              {o.label}<Handle id={o.id} type="source" position={Position.Right} className="automation-port" style={{ right: -18 }} />
            </div>
          ))}
        </div>
      ) : !compact && !solid && <>
        {media === "audio" ? (
          <div className="automation-audio-preview"><Volume2 size={20} />{c.url ? "Áudio adicionado" : "Adicionar áudio"}</div>
        ) : media ? (
          <div className="automation-media-preview">
            {c.url && media === "image" ? <img src={c.url} alt={c.caption || "Imagem da mensagem"} className="h-full w-full object-contain" />
              : c.url && media === "video" ? <video src={c.url} className="h-full w-full object-contain" muted />
              : <Icon size={32} strokeWidth={1.5} />}
          </div>
        ) : null}
        {media !== "audio" && <div className="automation-node-body">{media ? (c.caption || (c.url ? "" : "Sem arquivo")) : (text || def.label)}</div>}
        {data.type === "send_buttons" && (c.buttons ?? []).map((button: { id: string; title: string }) => <div key={button.id} className="automation-button-preview">{button.title || button.id}</div>)}
      </>}

      {!replyTrigger && outputs.length === 1 && <Handle id={outputs[0].id} type="source" position={Position.Right} className="automation-port" />}
      {!replyTrigger && outputs.length > 1 && <div className="automation-node-outputs">{outputs.map((output) => <div key={output.id} className="automation-node-output">{output.label}<Handle id={output.id} type="source" position={Position.Right} className="automation-port" /></div>)}</div>}
      {c.note && data.type !== "act_handoff" && <div className="automation-node-note">{c.note}</div>}
    </div>
  );
}
