import React, { useState, useRef, useEffect } from "react";
import { AlertCircle, Loader2, Sparkles, Upload } from "lucide-react";
import { OcrContext } from "../types";
import { buildLocalOcrSections, doOCR, parseBaziOcr } from "../services/deepseekService";

interface BaziImageFormProps {
  onSuccess: (ctx: OcrContext) => void;
}

const BaziImageForm: React.FC<BaziImageFormProps> = ({ onSuccess }) => {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"男" | "女">("男");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const nextFrame = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

  const fileToBase64 = (imgFile: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.split(",")[1];
        if (!base64) {
          reject(new Error("图片读取失败"));
          return;
        }
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(imgFile);
    });

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("请输入姓名");
      return;
    }
    if (!file) {
      setError("请上传问真八字截图");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件");
      return;
    }

    try {
      setLoading(true);
      setLoadingText("正在读取图片...");
      await nextFrame();
      const imageBase64 = await fileToBase64(file);
      if (!mountedRef.current) return;
      setLoadingText("正在识别图片...");
      await nextFrame();
      const rawText = await doOCR(imageBase64);
      if (!rawText.trim()) throw new Error("OCR 未识别到有效文字，请换一张更清晰的截图");
      if (!mountedRef.current) return;
      setLoadingText("识别完成，正在整理排盘...");
      await nextFrame();
      const baziSections = buildLocalOcrSections(rawText);
      const parsed = parseBaziOcr(rawText, name.trim(), gender);

      if (mountedRef.current) {
        onSuccess({ rawText, imageBase64, name: name.trim(), gender, baziSections, parsed });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "识别失败，请稍后重试";
      setError(msg);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="w-full max-w-2xl bg-white/92 backdrop-blur p-6 md:p-8 rounded-2xl shadow-[0_18px_50px_rgba(15,23,42,0.08)] border border-white/70 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-slate-900 to-emerald-500" />
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold font-serif-sc text-slate-900">上传图片</h2>
        <p className="text-sm text-slate-500 mt-1.5">填好姓名和性别，放入排盘截图即可</p>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">姓名</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="姓名"
              className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">性别</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as "男" | "女")}
              className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm appearance-none"
            >
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">截图</label>
          <label className={`flex items-center justify-center gap-3 px-4 py-6 border-2 border-dashed rounded-lg cursor-pointer transition-all ${file ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'}`}>
            <Upload className={`w-5 h-5 ${file ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span className={`text-sm ${file ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
              {file ? file.name : "点击上传"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 text-red-600 bg-red-50 px-4 py-3 rounded-lg border border-red-100">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {loadingText || "识别中..."}
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              开始
            </>
          )}
        </button>
      </div>

    </div>
  );
};

export default BaziImageForm;
