import * as React from "react";
import { useRef, useState, useEffect, useCallback } from "react";
import { Sparkles, Zap, FileText, Cpu } from "lucide-react";
import { cn } from "../../lib/utils";

// ----------------------------------------------------------------------
// Transition Physics
// ----------------------------------------------------------------------
const SPRING_TRANSITION =
  "max-width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
const SMOOTH_HEIGHT_TRANSITION =
  "max-width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), height 0.15s ease-out";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------
interface Attachment {
  id: string;
  file: File;
  url: string;
  name: string;
  width?: number;
  height?: number;
}

// ----------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------
function MorphingText({ text }: { text: string }) {
  const [width, setWidth] = useState<number | "auto">("auto");
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (spanRef.current) {
      setWidth(spanRef.current.offsetWidth);
    }
  }, [text]);

  return (
    <span
      className="relative inline-flex items-center justify-center overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]"
      style={{ width }}
    >
      <span ref={spanRef} className="invisible whitespace-nowrap px-1">
        {text}
      </span>
      <span
        key={text}
        className="absolute inset-0 flex items-center justify-center whitespace-nowrap animate-in fade-in zoom-in-95 duration-300"
      >
        {text}
      </span>
    </span>
  );
}

function ModelIcon({ model, className }: { model: string; className?: string }) {
  const lower = model.toLowerCase();
  if (lower.includes("rápid") || lower.includes("flash")) {
    return <Zap className={cn("text-amber-400", className)} />;
  }
  if (lower.includes("executiv") || lower.includes("relat") || lower.includes("opus")) {
    return <FileText className={cn("text-sky-400", className)} />;
  }
  if (lower.includes("gemini") || lower.includes("iceves")) {
    return <Sparkles className={cn("text-emerald-400", className)} />;
  }
  return <Cpu className={cn("text-foreground/75", className)} />;
}

function ArrowUpIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 12V2M7 2L2.5 6.5M7 2L11.5 6.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="5" y="1" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.75 6.5V7a4.25 4.25 0 0 0 8.5 0v-.5M7 11.25V13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 2.5V11.5M2.5 7H11.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 2.5L11.5 11.5M11.5 2.5L2.5 11.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DynamicBarsIcon({ level }: { level: string }) {
  const lower = level.toLowerCase();
  const isMediumOrHigh =
    lower === "medium" ||
    lower === "max effort" ||
    lower.includes("equilibr") ||
    lower.includes("detalh");
  const isHigh = lower === "max effort" || lower.includes("detalh");

  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect
        x="1.5"
        y="8"
        width="2.5"
        height="4.5"
        rx="1"
        fill="currentColor"
        className="transition-opacity duration-300"
        opacity={1}
      />
      <rect
        x="5.75"
        y="5"
        width="2.5"
        height="7.5"
        rx="1"
        fill="currentColor"
        className="transition-opacity duration-300"
        opacity={isMediumOrHigh ? 1 : 0.3}
      />
      <rect
        x="10"
        y="2"
        width="2.5"
        height="10.5"
        rx="1"
        fill="currentColor"
        className="transition-opacity duration-300"
        opacity={isHigh ? 1 : 0.3}
      />
    </svg>
  );
}

// ----------------------------------------------------------------------
// Attachment Thumbnail
// ----------------------------------------------------------------------
function AttachmentThumb({
  attachment,
  index,
  onRemove,
  onOpen,
  registerRef,
}: {
  attachment: Attachment;
  index: number;
  onRemove: (id: string) => void;
  onOpen: (attachment: Attachment, rect: DOMRect) => void;
  registerRef: (id: string, el: HTMLButtonElement | null) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={(el) => {
        btnRef.current = el;
        registerRef(attachment.id, el);
      }}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (btnRef.current) {
          onOpen(attachment, btnRef.current.getBoundingClientRect());
        }
      }}
      style={{ animationDelay: `${index * 35}ms`, animationFillMode: "backwards" }}
      className={cn(
        "group relative size-12 shrink-0 overflow-hidden rounded-xl border border-border bg-muted outline-none",
        "transition-transform duration-200 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:scale-[1.04] active:scale-[0.96]",
        "animate-in fade-in slide-in-from-top-3 zoom-in-90 duration-400"
      )}
      aria-label={`Visualizar anexo ${attachment.name}`}
    >
      <img
        src={attachment.url}
        alt={attachment.name}
        className="size-full object-cover"
        draggable={false}
      />
      <span
        className={cn(
          "absolute inset-0 flex items-start justify-end bg-black/0 transition-colors duration-200",
          isHovered && "bg-black/25"
        )}
      >
        <span
          role="button"
          tabIndex={-1}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(attachment.id);
          }}
          className={cn(
            "m-1 flex size-4 items-center justify-center rounded-full bg-background/90 text-foreground/70 shadow-sm transition-all duration-200 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:bg-background hover:text-foreground hover:scale-110",
            isHovered ? "opacity-100 scale-100" : "opacity-0 scale-50 pointer-events-none"
          )}
          aria-label={`Remover ${attachment.name}`}
        >
          <CloseIcon />
        </span>
      </span>
    </button>
  );
}

// ----------------------------------------------------------------------
// Shared-Element Gallery Modal
// ----------------------------------------------------------------------
function AttachmentGalleryModal({
  attachment,
  originRect,
  onClose,
}: {
  attachment: Attachment;
  originRect: DOMRect;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"opening" | "open" | "closing">("opening");
  const [targetRect, setTargetRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
    radius: number;
  } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const maxW = Math.min(window.innerWidth * 0.86, 560);
    const maxH = Math.min(window.innerHeight * 0.78, 720);

    const naturalW = attachment.width || 800;
    const naturalH = attachment.height || 600;
    const scale = Math.min(maxW / naturalW, maxH / naturalH, 1.6);

    const width = naturalW * scale;
    const height = naturalH * scale;

    setTargetRect({
      top: (window.innerHeight - height) / 2,
      left: (window.innerWidth - width) / 2,
      width,
      height,
      radius: 20,
    });

    const raf = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(raf);
  }, [attachment]);

  const handleClose = useCallback(() => setPhase("closing"), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleClose]);

  const isOpen = phase === "open";
  const isClosing = phase === "closing";

  const geometry =
    isOpen && targetRect
      ? targetRect
      : {
          top: originRect.top,
          left: originRect.left,
          width: originRect.width,
          height: originRect.height,
          radius: 12,
        };

  const animEasing = isClosing ? "ease-out" : "cubic-bezier(0.175, 0.885, 0.32, 1.275)";
  const animDur = isClosing ? "0.3s" : "0.45s";
  const flipTransition = `top ${animDur} ${animEasing}, left ${animDur} ${animEasing}, width ${animDur} ${animEasing}, height ${animDur} ${animEasing}, border-radius ${animDur} ${animEasing}`;

  return (
    <div className="fixed inset-0 z-[100]" onClick={handleClose} role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-md transition-opacity duration-400"
        style={{ opacity: isOpen ? 1 : 0 }}
      />
      <div
        style={{
          position: "fixed",
          top: geometry.top,
          left: geometry.left,
          width: geometry.width,
          height: geometry.height,
          borderRadius: geometry.radius,
          transition: flipTransition,
          overflow: "hidden",
          boxShadow: isOpen ? "0 24px 60px -12px rgb(0 0 0 / 0.35)" : "0 0px 0px 0px rgb(0 0 0 / 0)",
        }}
        className="bg-muted"
        onTransitionEnd={() => {
          if (phase === "closing") onClose();
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          ref={imgRef}
          src={attachment.url}
          alt={attachment.name}
          className="size-full object-cover"
          draggable={false}
        />
      </div>

      <button
        type="button"
        onClick={handleClose}
        style={{ opacity: isOpen ? 1 : 0, transform: isOpen ? "scale(1)" : "scale(0.7)" }}
        className={cn(
          "fixed right-4 top-4 flex size-9 items-center justify-center rounded-full bg-card/90 text-foreground/70 shadow-md backdrop-blur-sm",
          "transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:bg-card hover:text-foreground",
          !isOpen && "pointer-events-none"
        )}
        aria-label="Fechar visualização"
      >
        <span className="scale-150">
          <CloseIcon />
        </span>
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------

export interface PromptInputProps {
  onSubmit?: (
    value: string,
    meta: { model: string; effort: string; attachments: File[] }
  ) => void;
  onVoiceError?: (message: string) => void;
  placeholder?: string;
  className?: string;
  models?: string[];
  efforts?: string[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  maxAttachments?: number;
  disabled?: boolean;
  collapsedMaxWidth?: number;
  expandedMaxWidth?: number;
}

export const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  (
    {
      onSubmit,
      onVoiceError,
      placeholder = "Pergunte qualquer coisa...",
      className,
      models = ["Gemini ICEVES", "Análise Rápida", "Resumo Executivo"],
      efforts = ["Objetiva", "Equilibrada", "Detalhada"],
      defaultValue = "",
      value: controlledValue,
      onChange,
      maxAttachments = 6,
      disabled = false,
      collapsedMaxWidth = 360,
      expandedMaxWidth = 600,
    },
    ref
  ) => {
    const [expanded, setExpanded] = useState(false);
    const [isSmoothResize, setIsSmoothResize] = useState(false);
    const [localValue, setLocalValue] = useState(defaultValue);
    const [selectedModel, setSelectedModel] = useState(models[0]);
    const [effortIndex, setEffortIndex] = useState(1);
    const [isModelSelectOpen, setIsModelSelectOpen] = useState(false);

    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [activeAttachment, setActiveAttachment] = useState<{
      attachment: Attachment;
      rect: DOMRect;
    } | null>(null);

    // Audio/Voice recording states
    const [isRecording, setIsRecording] = useState(false);
    const [audioData, setAudioData] = useState<number[]>(new Array(5).fill(0));
    const valueRef = useRef(controlledValue !== undefined ? controlledValue : localValue);

    // Refs for Web Audio & Speech Recognition cleanup
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const rafRef = useRef<number | null>(null);
    const recognitionRef = useRef<any>(null);

    const [hoverStyle, setHoverStyle] = useState({
      opacity: 0,
      transform: "translateY(0px) scale(0.95)",
      transition: "none",
    });
    const [containerHeight, setContainerHeight] = useState(116);
    const [textareaHeight, setTextareaHeight] = useState(68);
    const [isScrolling, setIsScrolling] = useState(false);

    const isControlled = controlledValue !== undefined;
    const value = isControlled ? controlledValue : localValue;
    const hasValue = value.trim() !== "" || attachments.length > 0;
    const hasAttachments = attachments.length > 0;

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const internalContainerRef = useRef<HTMLDivElement>(null);
    const topFadeRef = useRef<HTMLDivElement>(null);
    const bottomFadeRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const thumbRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

    useEffect(() => {
      valueRef.current = value;
    }, [value]);

    const updateFades = () => {
      const el = textareaRef.current;
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (topFadeRef.current) {
        topFadeRef.current.style.opacity = Math.min(scrollTop / 20, 1).toString();
      }
      if (bottomFadeRef.current) {
        const bottomScroll = scrollHeight - clientHeight - scrollTop;
        bottomFadeRef.current.style.opacity = Math.min(Math.max(bottomScroll - 16, 0) / 10, 1).toString();
      }
    };

    const handleValueChange = useCallback(
      (val: string) => {
        setIsSmoothResize(true);
        if (!isControlled) setLocalValue(val);
        onChange?.(val);
      },
      [isControlled, onChange]
    );

    const expand = () => {
      if (disabled) return;
      setIsSmoothResize(false);
      setExpanded(true);
    };

    // --- Voice Recording Logic ---
    const stopRecording = useCallback(() => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      setIsRecording(false);
      setAudioData(new Array(5).fill(0));
    }, []);

    const startRecording = useCallback(async () => {
      if (disabled) return;
      setIsSmoothResize(false);
      setExpanded(true);

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      let stream: MediaStream | null = null;
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      } catch {
        onVoiceError?.("Permissão de microfone negada ou indisponível neste dispositivo.");
        return;
      }

      if (!stream) {
        onVoiceError?.("Microfone não detectado neste navegador.");
        return;
      }

      if (!SpeechRecognition) {
        stream.getTracks().forEach((track) => track.stop());
        onVoiceError?.("Reconhecimento de voz não suportado neste navegador. Digite sua pergunta.");
        return;
      }

      setIsRecording(true);
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateVisualizer = () => {
        analyser.getByteFrequencyData(dataArray);
        const bands = new Array(5).fill(0);
        const step = Math.floor(dataArray.length / 5);
        for (let i = 0; i < 5; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += dataArray[i * step + j];
          }
          bands[i] = sum / step / 255;
        }
        setAudioData(bands);
        rafRef.current = requestAnimationFrame(updateVisualizer);
      };
      updateVisualizer();

      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = true;
      recognition.interimResults = true;

      let baseline = valueRef.current;

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          baseline += (baseline ? " " : "") + finalTranscript;
        }

        handleValueChange((baseline + (interimTranscript ? " " + interimTranscript : "")).trim());
      };

      recognition.onerror = () => {
        stopRecording();
      };

      recognition.onend = () => {
        stopRecording();
      };

      recognitionRef.current = recognition;
      recognition.start();
    }, [disabled, handleValueChange, onVoiceError, stopRecording]);

    useEffect(() => {
      if (isRecording && textareaRef.current) {
        textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
      }
    }, [value, isRecording]);

    useEffect(() => {
      return () => {
        stopRecording();
      };
    }, [stopRecording]);

    useEffect(() => {
      if ((value.trim() !== "" || hasAttachments) && !expanded) {
        setIsSmoothResize(false);
        setExpanded(true);
      }
    }, [value, expanded, hasAttachments]);

    useEffect(() => {
      if (expanded && !isRecording && !disabled) {
        const timer = setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const length = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(length, length);
          }
        }, 50);
        return () => clearTimeout(timer);
      }
    }, [expanded, isRecording, disabled]);

    useEffect(() => {
      if (!textareaRef.current) return;
      const el = textareaRef.current;

      const currentHeight = el.style.height;
      el.style.transition = "none";
      el.style.height = "0px";
      const scrollHeight = el.scrollHeight;
      el.style.height = currentHeight;
      void el.offsetHeight;
      el.style.transition = "";

      const newHeight = Math.max(68, Math.min(scrollHeight, 160));
      el.style.height = `${newHeight}px`;

      setTextareaHeight(newHeight);
      setIsScrolling(scrollHeight > 160);

      setTimeout(updateFades, 0);
    }, [value, expanded]);

    useEffect(() => {
      setContainerHeight(Math.max(116, textareaHeight + 48));
      setTimeout(updateFades, 0);
    }, [textareaHeight]);

    useEffect(() => {
      if (!isModelSelectOpen) return;
      const handleOutsideClick = (e: MouseEvent) => {
        if (internalContainerRef.current && !internalContainerRef.current.contains(e.target as Node)) {
          setIsModelSelectOpen(false);
        }
      };
      document.addEventListener("mousedown", handleOutsideClick);
      return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [isModelSelectOpen]);

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
      if (
        internalContainerRef.current &&
        internalContainerRef.current.contains(e.relatedTarget as Node)
      ) {
        return;
      }
      if (value.trim() === "" && !hasAttachments && !isRecording) {
        setIsSmoothResize(false);
        setExpanded(false);
        setIsModelSelectOpen(false);
      }
    };

    const handleSubmit = () => {
      if (disabled || (value.trim() === "" && !hasAttachments)) return;
      setIsSmoothResize(false);
      onSubmit?.(value, {
        model: selectedModel,
        effort: efforts[effortIndex] || efforts[0],
        attachments: attachments.map((a) => a.file),
      });
      handleValueChange("");
      attachments.forEach((a) => URL.revokeObjectURL(a.url));
      setAttachments([]);
      setExpanded(false);
      setIsModelSelectOpen(false);
    };

    const cycleEffort = (e: React.MouseEvent) => {
      e.stopPropagation();
      setEffortIndex((prev) => (prev + 1) % efforts.length);
    };

    const openFileChooser = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!disabled) fileInputRef.current?.click();
    };

    const addAttachment = (file: File, url: string, width: number, height: number) => {
      const id = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
      setAttachments((prev) => [...prev, { id, file, url, name: file.name, width, height }]);
    };

    const handleFilesChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
      e.target.value = "";

      if (files.length === 0) return;
      const room = Math.max(0, maxAttachments - attachments.length);
      const accepted = files.slice(0, room);

      if (!expanded) {
        setIsSmoothResize(false);
        setExpanded(true);
      } else {
        setIsSmoothResize(true);
      }

      for (const file of accepted) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => addAttachment(file, url, img.naturalWidth, img.naturalHeight);
        img.onerror = () => addAttachment(file, url, 800, 600);
        img.src = url;
      }
    };

    const removeAttachment = (id: string) => {
      setIsSmoothResize(true);
      setAttachments((prev) => {
        const target = prev.find((a) => a.id === id);
        if (target) URL.revokeObjectURL(target.url);
        return prev.filter((a) => a.id !== id);
      });
      thumbRefs.current.delete(id);
    };

    const showArrow = hasValue && !isRecording;
    const showStop = isRecording;
    const showMic = !hasValue && !isRecording;

    const onActionButtonClick = (e: React.MouseEvent) => {
      e.preventDefault();
      if (disabled) return;
      if (isRecording) {
        stopRecording();
      } else if (hasValue) {
        handleSubmit();
      } else {
        startRecording();
      }
    };

    return (
      <>
        <div
          ref={(node) => {
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
            internalContainerRef.current = node;
          }}
          onBlur={handleBlur}
          className={cn("relative flex flex-col w-full mx-auto", disabled && "opacity-60", className)}
          style={{
            maxWidth: expanded ? expandedMaxWidth : collapsedMaxWidth,
            transition: isSmoothResize
              ? "max-width 0.15s ease-out"
              : "max-width 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesChosen}
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
          />

          {/* Independent Attachment Tab */}
          <div
            aria-hidden={!hasAttachments}
            style={{
              height: hasAttachments && expanded ? 68 : 0,
              transition: isSmoothResize
                ? "height 0.15s ease-out"
                : "height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
            }}
            className="w-full relative z-0 overflow-hidden"
          >
            <div
              style={{
                position: "absolute",
                bottom: -8,
                left: 20,
                right: 20,
                height: 68,
                transform: hasAttachments && expanded ? "translateY(0)" : "translateY(100%)",
                opacity: hasAttachments && expanded ? 1 : 0,
                transition: isSmoothResize
                  ? "transform 0.15s ease-out, opacity 0.15s ease-out"
                  : "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease-out",
              }}
              className="border border-border border-b-0 bg-muted rounded-t-2xl px-2 pt-2 pb-1 flex items-start gap-2 overflow-x-auto prompt-scrollbar"
            >
              {attachments.map((attachment, index) => (
                <AttachmentThumb
                  key={attachment.id}
                  attachment={attachment}
                  index={index}
                  onRemove={removeAttachment}
                  onOpen={(a, rect) => setActiveAttachment({ attachment: a, rect })}
                  registerRef={(id, el) => thumbRefs.current.set(id, el)}
                />
              ))}
            </div>
          </div>

          {/* Main Input Card */}
          <div
            onMouseDown={(e) => {
              const isTextarea = e.target === textareaRef.current;
              if (expanded && !isTextarea && !isRecording && !disabled) {
                e.preventDefault();
                textareaRef.current?.focus();
              }
            }}
            style={{
              borderRadius: 24,
              height: expanded ? containerHeight : 48,
              transition: isSmoothResize ? SMOOTH_HEIGHT_TRANSITION : SPRING_TRANSITION,
              overflow: expanded ? "visible" : "hidden",
            }}
            className={cn(
              "relative w-full border border-border bg-card shadow-sm focus-within:border-ring/50 focus-within:ring-1 focus-within:ring-ring/25 hover:border-border/80 z-10",
              expanded ? "cursor-text" : "cursor-pointer"
            )}
          >
            <style
              dangerouslySetInnerHTML={{
                __html: `
              .prompt-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; background: transparent; }
              .prompt-scrollbar::-webkit-scrollbar-track { background: transparent; }
              .prompt-scrollbar::-webkit-scrollbar-thumb { background: transparent; border-radius: 4px; }
              .prompt-scrollbar:hover::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--muted-foreground) 35%, transparent); }
            `,
              }}
            />

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => handleValueChange(e.target.value)}
              onScroll={updateFades}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
                if (e.key === "Escape" && value.trim() === "" && !hasAttachments) {
                  setIsSmoothResize(false);
                  setExpanded(false);
                  setIsModelSelectOpen(false);
                }
              }}
              placeholder={placeholder}
              aria-label="Campo de pergunta ICEVES Inteligência"
              disabled={isRecording || disabled}
              style={{
                transition: isSmoothResize
                  ? "height 0.15s ease-out"
                  : "opacity 0.3s ease-out, transform 0.3s ease-out, height 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
              }}
              className={cn(
                "prompt-scrollbar absolute top-0 inset-x-0 z-[1] w-full resize-none bg-transparent pl-4 pr-12 py-3.5 text-sm leading-[22px] text-foreground outline-none placeholder:font-medium placeholder:text-muted-foreground/80 cursor-text",
                expanded
                  ? "opacity-100 scale-100 translate-y-0"
                  : "opacity-0 scale-95 -translate-y-1 pointer-events-none",
                isScrolling ? "overflow-y-auto" : "overflow-y-hidden",
                (isRecording || disabled) && "pointer-events-none"
              )}
            />

            <div
              ref={topFadeRef}
              className="absolute left-4 right-12 top-0 z-[2] h-8 bg-gradient-to-b from-card via-card/90 to-transparent pointer-events-none"
              style={{ opacity: 0 }}
            />
            <div
              ref={bottomFadeRef}
              className="absolute left-4 right-12 z-[2] h-8 bg-gradient-to-t from-card via-card/90 to-transparent pointer-events-none"
              style={{
                opacity: 0,
                top: `${textareaHeight - 32}px`,
                transition: isSmoothResize
                  ? "top 0.15s ease-out"
                  : "top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
              }}
            />

            <button
              type="button"
              onClick={expand}
              disabled={disabled}
              style={{
                transition: isSmoothResize
                  ? "none"
                  : "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
              }}
              className={cn(
                "absolute inset-x-0 top-0 z-[1] cursor-text pl-4 pr-12 py-[15px] text-left text-sm font-medium leading-[17px] text-muted-foreground/90 outline-none truncate",
                !expanded
                  ? "opacity-100 scale-100 translate-y-0"
                  : "opacity-0 scale-105 translate-y-1 pointer-events-none"
              )}
              aria-label="Abrir campo de consulta"
            >
              {placeholder}
            </button>

            {/* Bottom Actions Wrapper */}
            <div
              className={cn(
                "absolute bottom-2 left-3 right-12 z-[10] flex items-center gap-0 transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
                expanded && !isRecording
                  ? "opacity-100 blur-0 translate-y-0 pointer-events-auto"
                  : "opacity-0 blur-sm translate-y-2 pointer-events-none"
              )}
            >
              <div className="relative">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsModelSelectOpen((prev) => !prev);
                  }}
                  className={cn(
                    "group flex items-center gap-1 rounded-full px-2 py-1 text-foreground/60 transition-all duration-200 outline-none hover:bg-accent/70 hover:text-foreground cursor-pointer",
                    isModelSelectOpen ? "bg-accent/70 text-foreground" : ""
                  )}
                  aria-label={`Modo selecionado: ${selectedModel}`}
                >
                  <ModelIcon
                    model={selectedModel}
                    className="size-3.5 opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                  <span className="text-xs font-semibold select-none transition-colors">
                    <MorphingText text={selectedModel} />
                  </span>
                </button>

                <div
                  style={{ transformOrigin: "bottom left" }}
                  onMouseLeave={() => {
                    setHoverStyle((prev) => ({
                      ...prev,
                      opacity: 0,
                      transform: prev.transform.replace("scale(1)", "scale(0.95)"),
                      transition: "opacity 0.2s ease-in, transform 0.2s ease-out",
                    }));
                  }}
                  className={cn(
                    "absolute bottom-full left-0 mb-2.5 z-50 w-48 rounded-2xl border border-border bg-card/95 p-1 shadow-xl backdrop-blur-md flex flex-col gap-0.5 transition-all duration-400 cursor-default",
                    isModelSelectOpen
                      ? "opacity-100 scale-100 translate-y-0 pointer-events-auto ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                      : "opacity-0 scale-95 translate-y-3 pointer-events-none ease-[cubic-bezier(0.175,0.885,0.32,1.275)]"
                  )}
                >
                  <div className="relative flex flex-col gap-0.5">
                    <div
                      style={hoverStyle}
                      className="absolute left-0 right-0 top-0 h-8 -z-10 rounded-xl bg-accent pointer-events-none"
                    />
                    {models.map((model, idx) => (
                      <button
                        key={model}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => {
                          setHoverStyle((prev) => ({
                            opacity: 1,
                            transform: `translateY(${idx * 34}px) scale(1)`,
                            transition:
                              prev.opacity === 0
                                ? "opacity 0.15s ease-out"
                                : "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.15s ease",
                          }));
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedModel(model);
                          setIsModelSelectOpen(false);
                        }}
                        className="group relative flex h-8 w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-foreground/85 outline-none active:scale-[0.98] cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <ModelIcon
                            model={model}
                            className="size-3.5 opacity-85 group-hover:opacity-100 transition-opacity"
                          />
                          {model}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cycleEffort}
                className="group flex items-center gap-1 rounded-full px-2 py-1 text-foreground/60 transition-all duration-200 hover:bg-accent/70 hover:text-foreground outline-none cursor-pointer"
                title="Alternar profundidade da resposta"
              >
                <DynamicBarsIcon level={efforts[effortIndex] || efforts[0]} />
                <span className="text-xs font-semibold select-none transition-colors">
                  <MorphingText text={efforts[effortIndex] || efforts[0]} />
                </span>
              </button>

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={openFileChooser}
                disabled={attachments.length >= maxAttachments || disabled}
                className="ml-auto flex size-7 items-center justify-center rounded-full text-foreground/60 transition-all duration-200 hover:bg-accent/70 hover:text-foreground outline-none cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                title="Anexar imagem de referência"
                aria-label="Anexar imagem"
              >
                <PlusIcon />
              </button>
            </div>

            {/* Audio Wave Visualizer Overlay */}
            <div
              className={cn(
                "absolute right-12 bottom-2 z-[10] flex h-8 items-center justify-end gap-[3px] transition-all duration-400 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
                isRecording
                  ? "w-16 opacity-100 translate-x-0"
                  : "w-0 opacity-0 translate-x-4 pointer-events-none"
              )}
            >
              {audioData.map((val, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-primary transition-[height] duration-75 ease-out"
                  style={{ height: `${Math.max(4, val * 24)}px` }}
                />
              ))}
            </div>

            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={onActionButtonClick}
              disabled={disabled}
              aria-label={
                showArrow
                  ? "Enviar pergunta"
                  : showStop
                    ? "Parar gravação"
                    : "Usar entrada de voz"
              }
              style={{ borderRadius: 9999 }}
              className="absolute right-2 bottom-2 z-[10] flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground transition-all duration-300 hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer disabled:opacity-40"
            >
              <span className="relative flex h-full w-full items-center justify-center">
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
                    showArrow
                      ? "opacity-100 scale-100 rotate-0 blur-none"
                      : "opacity-0 scale-50 rotate-45 blur-[1px] pointer-events-none"
                  )}
                >
                  <ArrowUpIcon />
                </span>
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
                    showMic
                      ? "opacity-100 scale-100 rotate-0 blur-none"
                      : "opacity-0 scale-50 -rotate-45 blur-[1px] pointer-events-none"
                  )}
                >
                  <MicIcon />
                </span>
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]",
                    showStop
                      ? "opacity-100 scale-100 rotate-0 blur-none"
                      : "opacity-0 scale-50 rotate-45 blur-[1px] pointer-events-none"
                  )}
                >
                  <StopIcon />
                </span>
              </span>
            </button>
          </div>
        </div>

        {activeAttachment && (
          <AttachmentGalleryModal
            attachment={activeAttachment.attachment}
            originRect={activeAttachment.rect}
            onClose={() => setActiveAttachment(null)}
          />
        )}
      </>
    );
  }
);

PromptInput.displayName = "PromptInput";
