set(component_sources
    "widgets/lap_timer/src/lap_timer_widget.cpp"
    "widgets/lap_timer/font/simcore_timer_58_Bold.c"
    "widgets/performance_overlay/src/performance_overlay_widget.cpp")
set(component_include_dirs
    "widgets/lap_timer/include"
    "widgets/performance_overlay/include")

idf_component_register(
    SRCS ${component_sources}
    INCLUDE_DIRS ${component_include_dirs}
    PRIV_REQUIRES esp_lvgl_port lap_timer performance simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-std=c++20>)
