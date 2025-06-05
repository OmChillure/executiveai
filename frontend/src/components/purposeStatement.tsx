import React from "react";

const PurposeStatement: React.FC = () => {
  return (
    <section className="flex flex-col items-center text-center max-w-4xl mx-auto mt-10 lg:mt-1 md:mt-1">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <h1 className="text-gray-400 text-5xl font-light">Meet Our Executive <span className="text-[#854e42] text-6xl font-light">AI Assistant</span></h1>
      </div>

      <h2 className="text-gray-400 text-[35px] font-light">
        Multiple Agents to deliver Secure Service.
      </h2>
      <p className="text-transparent bg-clip-text bg-gradient-to-r from-[#8e5c4c] to-[#adb3bc] text-sm mt-6 w-88">
        onaraAI intelligently selects the right agent to perform any task you need, all from a single command.
      </p>


    </section>
  );
};

export default PurposeStatement;
