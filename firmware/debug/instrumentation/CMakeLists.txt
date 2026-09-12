set(debug_sources "")
set(debug_includes "")
if(CONFIG_PITRIG_DEBUG)
    set(debug_sources "src/debug_read_instrumentation.cpp"
                      "src/display_instrumentation.cpp")
    set(debug_includes "include")
endif()

idf_component_register(SRCS ${debug_sources}
                       INCLUDE_DIRS ${debug_includes}
                       REQUIRES transport
                       PRIV_REQUIRES esp_timer freertos lvgl__lvgl performance)

if(debug_sources)
    target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
endif()
