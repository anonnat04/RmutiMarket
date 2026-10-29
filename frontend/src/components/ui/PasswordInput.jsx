import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import TextInput from "./TextInput";

export default function PasswordInput({ value, onChange, placeholder, error }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextInput
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        error={error}
        icon={Lock}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A8A] hover:text-[#E8631C]"
        tabIndex={-1}
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
