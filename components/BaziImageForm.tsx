import React, { useState, useRef, useEffect } from "react";
import { AlertCircle, Loader2, Sparkles, Upload } from "lucide-react";
import { OcrContext } from "../types";
import { doOCR, organizeOcrSections } from "../services/deepseekService";
import { saveSectionsToD1, makeCacheKey } from "../services/cacheService";

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

  const toBase64 = (imgFile: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("图片读取失败"));
          return;
        }
        const base64 = result.split(",")[1];
        if (!base64) {
          reject(new Error("图片数据为空"));
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
      setLoadingText("正在识别图片...");
      const imageBase64 = await toBase64(file);
      const rawText = await doOCR(imageBase64);

      setLoadingText("正在整理七大板块...");
      const baziSections = await organizeOcrSections(rawText);

      const key = await makeCacheKey(name.trim(), gender, rawText);
      saveSectionsToD1(key, name.trim(), gender, rawText, baziSections);

      if (mountedRef.current) {
        onSuccess({ rawText, imageBase64, name: name.trim(), gender, baziSections });
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
    <div className="w-full max-w-2xl bg-white p-8 md:p-10 rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold font-serif-sc text-gray-800">上传问真八字图片</h2>
        <p className="text-sm text-gray-400 mt-1.5">输入姓名和性别，AI 自动生成完整分析报告</p>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">姓名</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入姓名"
              className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-all text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">性别</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as "男" | "女")}
              className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none transition-all text-sm appearance-none"
            >
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wider">问真八字排盘截图</label>
          <label className={`flex items-center justify-center gap-3 px-4 py-6 border-2 border-dashed rounded-xl cursor-pointer transition-all ${file ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'}`}>
            <Upload className={`w-5 h-5 ${file ? 'text-indigo-600' : 'text-gray-400'}`} />
            <span className={`text-sm ${file ? 'text-indigo-700 font-medium' : 'text-gray-500'}`}>
              {file ? file.name : "点击上传截图"}
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
          <div className="flex items-center gap-2.5 text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 text-sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {loadingText || "识别图片中..."}
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              上传并识别八字
            </>
          )}
        </button>
      </div>

    </div>
  );
};

export default BaziImageForm;
