"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Info, ShieldAlert } from "lucide-react";
import Link from "next/link";
import config from "@/app/config";

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fafaf9] selection:bg-amber-200 selection:text-amber-900 relative">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-size-[24px_24px] pointer-events-none"></div>

      <Link href="/dashboard" className="btn absolute top-6 left-6 z-20">
        <ArrowLeft className="size-4 group-hover:-translate-x-1 transition-transform" />
        Quay lại
      </Link>

      <div className="flex-1 flex flex-col justify-center items-center px-4 py-20 relative z-10 w-full mb-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="max-w-3xl w-full"
        >
          <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-sm border border-stone-200 mb-8 mt-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-amber-100/50 text-amber-700 rounded-2xl">
                <Info className="size-6" />
              </div>
              <h1 className="title">Giới thiệu dự án</h1>
            </div>

            <div className="max-w-none">
              <p className="text-stone-600 leading-relaxed text-[15px] mb-8">
                <strong className="text-stone-800">{config.siteName}</strong> là
                một giải pháp quản lý gia phả dòng họ cá nhân, được thiết kế để
                giúp các gia đình tự xây dựng và bảo tồn cây phả hệ của riêng
                mình. Dự án giúp lưu giữ thông tin cội nguồn một cách trực quan,
                hiện đại và hoàn toàn riêng tư.
              </p>

              <div className="mt-8 mb-4 border-t border-stone-100 pt-8 flex items-center gap-3">
                <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                  <ShieldAlert className="size-5" />
                </div>
                <h2 className="text-xl font-bold text-stone-900">
                  Quyền riêng tư & Bảo mật
                </h2>
              </div>

              <div className="bg-stone-50 border border-stone-200/60 rounded-2xl p-6 text-[14.5px] leading-relaxed">
                <p className="font-bold text-stone-800 mb-4 bg-white py-2 px-3 rounded-lg border border-stone-200 shadow-sm inline-block">
                  Dữ liệu của bạn thuộc về bạn. Hệ thống được thiết kế để hoạt
                  động hoàn toàn trên máy chủ riêng của gia đình.
                </p>

                <ul className="space-y-4 text-stone-600 list-disc pl-5">
                  <li>
                    <strong className="text-stone-800">
                      Tự lưu trữ hoàn toàn (Self-hosted):
                    </strong>{" "}
                    Toàn bộ dữ liệu gia phả (tên, ngày sinh, quan hệ, thông tin
                    liên hệ...) và hình ảnh được lưu trữ trực tiếp trong cơ sở
                    dữ liệu và hệ thống tệp tin trên máy chủ mà bạn quản lý.
                  </li>
                  <li>
                    <strong className="text-stone-800">
                      Không thu thập dữ liệu:
                    </strong>{" "}
                    Ứng dụng không tích hợp bất kỳ mã theo dõi, analytics hay
                    telemetry nào. Không có thông tin người dùng nào được gửi ra
                    ngoài máy chủ của bạn.
                  </li>
                  <li>
                    <strong className="text-stone-800">
                      Kiểm soát tuyệt đối:
                    </strong>{" "}
                    Bạn có toàn quyền truy cập, sao lưu, xuất hoặc xóa toàn bộ
                    dữ liệu bất cứ lúc nào mà không phụ thuộc vào bất kỳ nhà
                    cung cấp dịch vụ đám mây nào.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
