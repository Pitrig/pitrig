set(debug_sources "")
set(debug_includes "")
if(CONFIG_SIMCORE_DEBUG)
    set(debug_sources "src/debug_diagnostics.cpp")
    set(debug_includes "include")
endif()

idf_component_register(SRCS ${debug_sources}
                       INCLUDE_DIRS ${debug_includes}
                       PRIV_REQUIRES heap performance)

if(debug_sources)
    target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
endif()
